# content-search

## Purpose

根据研究搜索词搜索互联网内容，抓取网页，提取结构化内容数据。

## When To Use

在 topic-research 完成后，使用生成的 researchQueries 搜索和抓取真实互联网内容。

## Input

```typescript
interface ContentSearchInput {
  queries: string[]
  topicId: string
  limit?: number
}
```

## Output

```typescript
interface ContentSearchOutput {
  contents: Array<{
    platform: string
    url: string
    title: string
    author?: string
    content: string
    publishedAt?: string
    metrics?: {
      likes?: number
      comments?: number
      shares?: number
      favorites?: number
      views?: number
    }
  }>
}
```

## Workflow

1. 遍历 queries
2. 调用 Firecrawl search 搜索每个 query
3. 获取搜索结果 URL 列表
4. 调用 Firecrawl scrape 抓取每个 URL 的内容
5. 结构化提取标题、作者、正文、发布时间、指标等
6. 去重
7. 返回结构化 Content[]

## Tools

- Firecrawl (search + scrape)

## Constraints

- 不虚构数据
- 缺失的指标用 null/undefined
- 必须保留 URL 作为来源
- 每条内容必须有 platform 标记

## Validation

- 每个 content 必须有 url
- 每个 content 必须有 platform
- content 不能为空

## Failure Handling

- 搜索失败：跳过该 query，继续其他 query
- 抓取失败：记录错误，跳过该 URL
- 全部失败：返回空数组 + 错误信息

## Version

1.0.0
