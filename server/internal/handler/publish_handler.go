package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"html"
	"html/template"
	"net/http"
	"strings"

	"zell-server/internal/model"
	"zell-server/internal/repository"
	zellTmpl "zell-server/internal/template"

	"github.com/gin-gonic/gin"
	"github.com/yuin/goldmark"
)

type PublishHandler struct {
	repo *repository.PublishRepo
	db   *repository.DB
}

func NewPublishHandler(db *repository.DB) *PublishHandler {
	return &PublishHandler{
		repo: repository.NewPublishRepo(db),
		db:   db,
	}
}

// ── API: Save publish config ────────────────────────────────────────────

func (h *PublishHandler) SaveConfig(c *gin.Context) {
	projectID := c.Param("pid")
	var body struct {
		Data      string `json:"data"`
		UpdatedAt string `json:"updated_at"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.repo.UpsertConfig(projectID, body.Data, body.UpdatedAt); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ── API: Save published article content ──────────────────────────────────

func (h *PublishHandler) SaveArticle(c *gin.Context) {
	projectID := c.Param("pid")
	var article model.PublishArticle
	if err := c.ShouldBindJSON(&article); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	article.ProjectID = projectID
	if err := h.repo.UpsertArticle(&article); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ── API: Save published whiteboard snapshot ───────────────────────────────

func (h *PublishHandler) SaveWhiteboard(c *gin.Context) {
	projectID := c.Param("pid")
	var wb model.PublishWhiteboard
	if err := c.ShouldBindJSON(&wb); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	wb.ProjectID = projectID
	if err := h.repo.UpsertWhiteboard(&wb); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ── Public: Wiki index ───────────────────────────────────────────────────

func (h *PublishHandler) WikiIndex(c *gin.Context) {
	projectID := c.Param("pid")
	cfg, err := h.repo.GetConfig(projectID)
	if err != nil || cfg == nil {
		c.Status(http.StatusNotFound)
		return
	}
	var data model.PublishData
	if err := json.Unmarshal([]byte(cfg.Data), &data); err != nil || !data.Enabled {
		c.Status(http.StatusNotFound)
		return
	}
	if len(data.Wiki) == 0 {
		c.Status(http.StatusNotFound)
		return
	}

	articles, err := h.db.ListArticles(projectID)
	if err != nil {
		c.Status(http.StatusNotFound)
		return
	}

	type articleItem struct {
		ID        string
		Title     string
		UpdatedAt string
	}
	wikiSet := make(map[string]bool)
	for _, id := range data.Wiki {
		wikiSet[id] = true
	}
	var items []articleItem
	for _, a := range articles {
		if !wikiSet[a.ID] {
			continue
		}
		items = append(items, articleItem{ID: a.ID, Title: a.Title, UpdatedAt: a.UpdatedAt})
	}

	zellTmpl.WikiIndexTmpl.ExecuteTemplate(c.Writer, "base.html", gin.H{
		"Title":       data.ProjectName + " — 知识库",
		"ProjectName": data.ProjectName,
		"Articles":    items,
		"BasePath":    "/pub/" + projectID,
	})
}

// ── Public: Wiki article ─────────────────────────────────────────────────

func (h *PublishHandler) WikiArticle(c *gin.Context) {
	projectID := c.Param("pid")
	articleID := c.Param("aid")
	cfg, err := h.repo.GetConfig(projectID)
	if err != nil || cfg == nil {
		c.Status(http.StatusNotFound)
		return
	}
	var data model.PublishData
	if err := json.Unmarshal([]byte(cfg.Data), &data); err != nil || !data.Enabled {
		c.Status(http.StatusNotFound)
		return
	}
	found := false
	for _, id := range data.Wiki {
		if id == articleID {
			found = true
			break
		}
	}
	if !found {
		c.Status(http.StatusNotFound)
		return
	}

	a, err := h.db.GetArticle(articleID)
	if err != nil {
		c.Status(http.StatusNotFound)
		return
	}

	var buf bytes.Buffer
	goldmark.Convert([]byte(a.Content), &buf)
	zellTmpl.WikiArticleTmpl.ExecuteTemplate(c.Writer, "base.html", gin.H{
		"Title":       a.Title,
		"ContentHTML": template.HTML(buf.String()),
		"BasePath":    "/pub/" + projectID,
	})
}

// ── Public: PPT preview ──────────────────────────────────────────────────

func (h *PublishHandler) PPTPreview(c *gin.Context) {
	projectID := c.Param("pid")
	wbID := c.Param("wid")
	cfg, err := h.repo.GetConfig(projectID)
	if err != nil || cfg == nil {
		c.Status(http.StatusNotFound)
		return
	}
	var data model.PublishData
	if err := json.Unmarshal([]byte(cfg.Data), &data); err != nil || !data.Enabled {
		c.Status(http.StatusNotFound)
		return
	}
	found := false
	for _, id := range data.PPT {
		if id == wbID {
			found = true
			break
		}
	}
	if !found {
		c.Status(http.StatusNotFound)
		return
	}

	wb, err := h.repo.GetWhiteboard(wbID)
	if err != nil {
		c.Status(http.StatusNotFound)
		return
	}

	var snapshot struct {
		Slides []struct {
			ID       string            `json:"id"`
			Name     string            `json:"name"`
			Bg       string            `json:"background"`
			BgOpacity *float64          `json:"backgroundOpacity"`
			Elements []json.RawMessage `json:"elements"`
		} `json:"slides"`
	}
	json.Unmarshal([]byte(wb.Snapshot), &snapshot)

	type slideData struct {
		HTML      string   `json:"html"`
		Bg        string   `json:"bg"`
		BgOpacity *float64 `json:"bgOpacity"`
	}
	var slides []slideData
	for _, s := range snapshot.Slides {
		slides = append(slides, slideData{
			HTML:      renderSlideElements(s.Elements),
			Bg:        s.Bg,
			BgOpacity: s.BgOpacity,
		})
	}

	slidesJSON, _ := json.Marshal(slides)

	zellTmpl.PptPreviewTmpl.ExecuteTemplate(c.Writer, "base.html", gin.H{
		"Title":      wb.Name,
		"Slides":     slides,
		"SlidesJSON": template.JS(slidesJSON),
		"Current":    0,
	})
}

// renderSlideElements renders PPT elements as inline HTML.
// Matches the rendering logic from SlidePreview.tsx (percentage-based CSS).
func renderSlideElements(elements []json.RawMessage) string {
	const slideW = 1280.0
	const slideH = 720.0

	buf := ""
	for _, raw := range elements {
		var el struct {
			Type          string            `json:"type"`
			X             float64           `json:"x"`
			Y             float64           `json:"y"`
			W             float64           `json:"w"`
			H             float64           `json:"h"`
			Opacity       float64           `json:"opacity"`
			Props         json.RawMessage   `json:"props"`
			GroupChildren []json.RawMessage `json:"groupChildren"`
		}
		if err := json.Unmarshal(raw, &el); err != nil {
			continue
		}

		var props struct {
			Fill           string `json:"fill"`
			Stroke         string `json:"stroke"`
			StrokeWidth    float64 `json:"strokeWidth"`
			BorderRadius   float64 `json:"borderRadius"`
			FontSize       float64 `json:"fontSize"`
			FontColor      string `json:"fontColor"`
			FontFamily     string `json:"fontFamily"`
			FontWeight     string `json:"fontWeight"`
			FontStyle      string `json:"fontStyle"`
			TextDecoration string `json:"textDecoration"`
			LineHeight     float64 `json:"lineHeight"`
			Text           string `json:"text"`
			Src            string `json:"src"`
			Shadows        []struct {
				X     float64 `json:"x"`
				Y     float64 `json:"y"`
				Blur  float64 `json:"blur"`
				Color string  `json:"color"`
			} `json:"shadows"`
		}
		json.Unmarshal(el.Props, &props)

		l := el.X / slideW * 100
		t := el.Y / slideH * 100
		w := el.W / slideW * 100
		h := el.H / slideH * 100
		opacity := el.Opacity
		if opacity == 0 {
			opacity = 1
		}

		var ss string
		for _, sh := range props.Shadows {
			ss += fmt.Sprintf("%.0fpx %.0fpx %.0fpx %s,", sh.X, sh.Y, sh.Blur, sh.Color)
		}
		ss = strings.TrimRight(ss, ",")

		switch el.Type {
		case "image":
			buf += fmt.Sprintf(`<img src="%s" style="position:absolute;left:%.2f%%;top:%.2f%%;width:%.2f%%;height:%.2f%%;opacity:%.2f" />`,
				props.Src, l, t, w, h, opacity)
		case "text":
			fontSize := props.FontSize
			if fontSize == 0 {
				fontSize = 16
			}
			fontColor := props.FontColor
			if fontColor == "" {
				fontColor = "#333"
			}
			fontFamily := props.FontFamily
			if fontFamily == "" {
				fontFamily = "inherit"
			}
			fontWeight := props.FontWeight
			if fontWeight == "" {
				fontWeight = "normal"
			}
			fontStyle := props.FontStyle
			if fontStyle == "" {
				fontStyle = "normal"
			}
			textDecoration := props.TextDecoration
			if textDecoration == "" {
				textDecoration = "none"
			}
			lineHeight := props.LineHeight
			if lineHeight == 0 {
				lineHeight = 1.5
			}
			text := html.EscapeString(props.Text)
			if text == "" {
				text = "&nbsp;"
			}
			buf += fmt.Sprintf(
				`<div style="position:absolute;left:%.2f%%;top:%.2f%%;width:%.2f%%;height:%.2f%%;opacity:%.2f;font-size:%.2fvw;color:%s;font-family:%s;font-weight:%s;font-style:%s;text-decoration:%s;line-height:%.2f;overflow:hidden;box-shadow:%s;padding:0.5%%">%s</div>`,
				l, t, w, h, opacity,
				fontSize/slideW*100,
				fontColor, fontFamily, fontWeight, fontStyle, textDecoration,
				lineHeight, ss, text,
			)
		case "ellipse":
			fill := props.Fill
			if fill == "" {
				fill = "#e2e8f0"
			}
			border := ""
			if props.StrokeWidth > 0 && props.Stroke != "" {
				border = fmt.Sprintf("border:calc(%.0f/1280*100vw) solid %s;", props.StrokeWidth, props.Stroke)
			}
			buf += fmt.Sprintf(
				`<div style="position:absolute;left:%.2f%%;top:%.2f%%;width:%.2f%%;height:%.2f%%;opacity:%.2f;border-radius:50%%;background:%s;%s;box-shadow:%s"></div>`,
				l, t, w, h, opacity, fill, border, ss,
			)
		default: // rect, etc.
			fill := props.Fill
			if fill == "" {
				fill = "#e2e8f0"
			}
			br := props.BorderRadius
			border := ""
			if props.StrokeWidth > 0 && props.Stroke != "" {
				border = fmt.Sprintf("border:calc(%.0f/1280*100vw) solid %s;", props.StrokeWidth, props.Stroke)
			}
			buf += fmt.Sprintf(
				`<div style="position:absolute;left:%.2f%%;top:%.2f%%;width:%.2f%%;height:%.2f%%;opacity:%.2f;border-radius:%.2fvw;background:%s;%s;box-shadow:%s"></div>`,
				l, t, w, h, opacity, br/slideW*100, fill, border, ss,
			)
		}
	}
	return buf
}
