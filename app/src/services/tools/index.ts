import { getProjectContext } from './getProjectContext'
import { listArticles } from './listArticles'
import { searchKnowledge } from './searchKnowledge'
import { searchResources } from './searchResources'
import { getArticle } from './getArticle'
import { getResource } from './getResource'

export const knowledgeTools = {
  get_project_context: getProjectContext,
  list_articles: listArticles,
  search_knowledge: searchKnowledge,
  search_resources: searchResources,
  get_article: getArticle,
  get_resource: getResource,
}
