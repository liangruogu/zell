package template

import (
	"embed"
	"html/template"
)

//go:embed *.html
var TemplateFS embed.FS

var (
	WikiIndexTmpl   = template.Must(template.ParseFS(TemplateFS, "base.html", "wiki_index.html"))
	WikiArticleTmpl = template.Must(template.ParseFS(TemplateFS, "base.html", "wiki_article.html"))
	PptPreviewTmpl  = template.Must(template.New("ppt").Funcs(template.FuncMap{
		"progressPercent": func(current, one, total int) float64 {
			return float64(current+one) / float64(total) * 100
		},
	}).ParseFS(TemplateFS, "base.html", "ppt_preview.html"))
)
