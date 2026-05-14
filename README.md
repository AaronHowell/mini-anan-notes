# Mini Notes - AI Agent 面试项目

基于 **Anna App** 生态实现的 mini-notes 应用，回答 AI Agent 开发面试题的全部 4 道题目。

## 项目结构

```
mini-anna-notes-anna/
├── manifest.json              # Anna App 应用清单 (schema 2)
├── app.json                   # 应用元数据
├── app/                       # 前端 (Vue 3 + TypeScript + Vite + Element Plus)
│   ├── src/
│   │   ├── components/
│   │   │   └── NoteApp.vue    # 主界面组件
│   │   ├── services/
│   │   │   └── annaToolClient.ts  # 调用后端工具的服务层
│   │   └── types/
│   │       ├── note.ts        # 笔记/摘要类型定义
│   │       └── anna-runtime.ts    # Anna App 运行时类型
│   └── index.html             # 入口 HTML
└── executas/mini-notes/       # 后端插件 (Python)
    ├── mini_notes_plugin.py   # JSON-RPC 插件实现
    └── pyproject.toml         # Python 包配置
```

## 运行方式

```bash
# 验证应用配置
anna-app validate
anna-app validate --strict

# 启动本地开发环境
anna-app dev
# 浏览器打开 http://127.0.0.1:5180/dev/<wid>?t=<dev-token>
```

---

## 题目一：实现 mini-notes 应用

> 完成笔记应用的核心功能：创建、删除、查看笔记，以及 AI 辅助摘要功能。

### 已实现功能

**前端 (Vue 3 + Element Plus)**

- 创建笔记：输入内容 + 回车/点击按钮添加
- 查看笔记：表格展示序号、内容、创建时间
- 删除笔记：单条删除，自动重排序号
- AI 摘要：点击"Summarize"按钮调用后端工具，展示摘要结果、笔记数量、分类标签

**后端 (Python JSON-RPC 插件)**

- 实现 `summarize_notes` 工具，通过 JSON-RPC 协议与前端通信
- 规则引擎分类：根据关键词匹配将笔记归类为"开发"、"协作"、"内容准备"、"客户跟进"或"日常事项"
- 支持 `initialize`、`describe`、`health`、`invoke`、`shutdown` 生命周期方法

### 关键代码

**前端调用链路** (`app/src/services/annaToolClient.ts`)：

```typescript
export async function summarizeNotes(notes: Note[]): Promise<NotesSummary> {
  const anna = await window.AnnaAppRuntime.connect();
  const response = await anna.tools.invoke({
    tool_id: "tool-dev-mini-notes",
    method: "summarize_notes",
    args: { notes: toPlainNotes(notes) }
  });
  return extractSummary(response);  // 多层 fallback 解析
}
```

**后端工具实现** (`executas/mini-notes/mini_notes_plugin.py`)：

```python
def summarize_notes(notes: List[Dict[str, Any]]) -> Dict[str, Any]:
    joined = " ".join(note["content"] for note in notes).lower()
    categories = []
    if any(word in joined for word in ["bug", "修复", "登录", "代码", "开发", "接口"]):
        categories.append("开发")
    # ... 更多分类规则
    return {
        "summary": f"当前共有 {count} 条笔记，主要集中在{'、'.join(categories)}。",
        "count": count,
        "categories": categories,
    }
```

**Anna App 清单配置** (`manifest.json`)：

```json
{
  "schema": 2,
  "permissions": ["tools.invoke", "storage.read", "storage.write"],
  "required_executas": [{ "tool_id": "tool-dev-mini-notes" }],
  "ui": {
    "bundle": { "format": "static-spa", "entry": "index.html" },
    "host_api": {
      "tools": ["tool-dev-mini-notes"],
      "storage": ["get", "set"],
      "window": ["set_title", "ready"]
    }
  }
}
```

---

## 题目二：流式输出展示

> 在已实现的 AI 助手中添加"流式输出"功能，让用户能看到 AI 模型实时生成内容的过程。

### 设计方案

#### 1. 后端：SSE 流式推送

插件增加 `stream_summarize` 方法，使用 Server-Sent Events 逐块推送：

```python
def stream_summarize_notes(req_id, notes):
    """流式返回摘要，每生成一段立即推送"""
    chunks = generate_summary_chunks(notes)  # 生成器，逐段产出

    for i, chunk in enumerate(chunks):
        write_frame({
            "jsonrpc": "2.0",
            "method": "stream/chunk",
            "params": {
                "request_id": req_id,
                "chunk": chunk,
                "done": False
            }
        })

    # 流结束标记
    write_frame({
        "jsonrpc": "2.0",
        "method": "stream/chunk",
        "params": {
            "request_id": req_id,
            "chunk": "",
            "done": True
        }
    })
```

#### 2. 前端：逐字渲染

```typescript
// annaToolClient.ts - 流式调用
export async function summarizeNotesStream(
  notes: Note[],
  onChunk: (text: string) => void
): Promise<void> {
  const anna = await window.AnnaAppRuntime.connect();

  // 注册流式回调
  anna.on("stream/chunk", (event) => {
    if (event.params.request_id === currentRequestId) {
      onChunk(event.params.chunk);
    }
  });

  await anna.tools.invoke({
    tool_id: TOOL_ID,
    method: "stream_summarize",
    args: { notes: toPlainNotes(notes) }
  });
}
```

```vue
<!-- NoteApp.vue - 流式渲染 -->
<script setup>
const streamText = ref('');
const isStreaming = ref(false);

async function streamSummarize() {
  isStreaming.value = true;
  streamText.value = '';

  await summarizeNotesStream(notes.value, (chunk) => {
    streamText.value += chunk;  // 逐块拼接
  });

  isStreaming.value = false;
}
</script>

<template>
  <el-card v-if="streamText || isStreaming" class="summary-card">
    <div class="stream-output">
      {{ streamText }}
      <span v-if="isStreaming" class="cursor">|</span>  <!-- 打字光标 -->
    </div>
  </el-card>
</template>
```

#### 3. 架构流程

```
用户点击 Summarize
       │
       ▼
  前端发起 stream_summarize 请求
       │
       ▼
  后端逐块生成摘要内容
       │
       ▼
  通过 stream/chunk 事件逐块推送 ──→ 前端 onChunk 回调
       │                                    │
       ▼                                    ▼
  推送 done: true 标记              逐字拼接渲染 + 打字光标效果
```

---

## 题目三：多用户协同编辑

> 设计一套机制，让多位用户可以同时编辑同一份文档或笔记，并尽量减少冲突、保证数据一致性。

### 设计方案

#### 1. 数据模型：向量时钟 + 操作日志

```typescript
// types/collaboration.ts
interface VectorClock {
  [userId: string]: number;
}

interface Operation {
  id: string;
  type: 'create' | 'update' | 'delete';
  userId: string;
  timestamp: number;
  vectorClock: VectorClock;
  payload: {
    noteId?: string;
    content?: string;
    position?: number;
  };
}

interface CollaborativeNote {
  id: string;
  content: string;
  version: number;
  vectorClock: VectorClock;
  lastEditedBy: string;
}
```

#### 2. 冲突检测：向量时钟比较

```python
# conflict_resolver.py
def compare_clocks(clock_a: dict, clock_b: dict) -> str:
    """比较两个向量时钟的关系"""
    a_greater = any(clock_a.get(k, 0) > clock_b.get(k, 0) for k in set(clock_a) | set(clock_b))
    b_greater = any(clock_b.get(k, 0) > clock_a.get(k, 0) for k in set(clock_a) | set(clock_b))

    if a_greater and not b_greater:
        return "a_after_b"     # A 在 B 之后，A 胜
    elif b_greater and not a_greater:
        return "b_after_a"     # B 在 A 之后，B 胜
    elif not a_greater and not b_greater:
        return "equal"         # 完全相同
    else:
        return "concurrent"    # 并发冲突！
```

#### 3. 冲突解决策略

| 策略 | 适用场景 | 实现方式 |
|------|----------|----------|
| **Last-Writer-Wins** | 非关键字段（标题、标签） | 比较物理时间戳，最新写入覆盖 |
| **Operational Transform** | 文本内容编辑 | 将操作变换后重放，保留双方意图 |
| **自动合并** | 不同字段的修改 | 字段级粒度合并，无需用户介入 |
| **用户选择** | 同一字段并发修改 | 弹出冲突对话框，让用户选择保留哪个版本 |

```python
# 合并逻辑示例
def resolve_conflict(local_op: Operation, remote_op: Operation) -> Operation:
    relation = compare_clocks(local_op.vectorClock, remote_op.vectorClock)

    if relation == "concurrent":
        # 并发冲突：根据字段类型选择策略
        if local_op.type == "update" and remote_op.type == "update":
            if local_op.payload.get("noteId") != remote_op.payload.get("noteId"):
                # 不同笔记的修改，自动合并
                return merge_operations(local_op, remote_op)
            else:
                # 同一笔记的并发修改，使用 OT 变换
                return operational_transform(local_op, remote_op)
    elif relation == "a_after_b":
        return local_op   # 本地更新，直接采用
    else:
        return remote_op  # 远程更新，直接采用
```

#### 4. 实时同步架构

```
┌──────────┐     WebSocket      ┌──────────────┐
│  用户 A   │◄──────────────────►│              │
└──────────┘                    │  协同服务器    │
                                │  (Operation  │
┌──────────┐     WebSocket      │   Log + CRDT)│
│  用户 B   │◄──────────────────►│              │
└──────────┘                    └──────┬───────┘
                                       │
                                ┌──────▼───────┐
                                │  持久化存储    │
                                │  (操作日志)    │
                                └──────────────┘
```

**同步流程**：
1. 用户 A 编辑笔记 → 生成 Operation（携带向量时钟）
2. 本地立即应用 → UI 即时反馈（乐观更新）
3. 通过 WebSocket 发送到协同服务器
4. 服务器检测冲突 → 如有冲突则执行合并策略
5. 广播给所有其他客户端
6. 客户端接收远程 Operation → 本地重放/变换后应用

---

## 题目四：10 万字长文档阅读 + 知识库问答

> 实现超长文档阅读助手和本地知识库问答系统。

### 1. 长文档处理：分层切片 + 语义索引

```python
# document_processor.py
from typing import List, Dict
import hashlib

class DocumentChunk:
    def __init__(self, content: str, metadata: dict):
        self.content = content
        self.metadata = metadata  # {page, section, heading, offset}
        self.embedding = None     # 向量表示
        self.chunk_id = hashlib.md5(content.encode()).hexdigest()[:12]

class LongDocumentProcessor:
    """10万字长文档处理器"""

    def __init__(self, chunk_size=512, overlap=64):
        self.chunk_size = chunk_size  # 每块 token 数
        self.overlap = overlap        # 块间重叠 token 数

    def process(self, document: str) -> List[DocumentChunk]:
        """三级切片策略"""

        # 第一级：按章节/标题切分（结构感知）
        sections = self._split_by_structure(document)

        # 第二级：段落内按语义段落切分
        paragraphs = []
        for section in sections:
            paragraphs.extend(self._split_by_paragraph(section))

        # 第三级：超长段落按 token 窗口切分（带重叠）
        chunks = []
        for para in paragraphs:
            if len(para["content"]) > self.chunk_size:
                chunks.extend(self._sliding_window(para))
            else:
                chunks.append(DocumentChunk(
                    content=para["content"],
                    metadata=para["metadata"]
                ))

        return chunks

    def _split_by_structure(self, doc: str) -> List[dict]:
        """按 Markdown 标题 / 编号章节切分"""
        import re
        sections = re.split(r'(?=^#{1,3}\s)', doc, flags=re.MULTILINE)
        return [{"content": s, "metadata": {"heading": s.split('\n')[0]}}
                for s in sections if s.strip()]

    def _sliding_window(self, section: dict) -> List[DocumentChunk]:
        """滑动窗口切分，保留上下文重叠"""
        tokens = self._tokenize(section["content"])
        chunks = []
        i = 0
        while i < len(tokens):
            window = tokens[i:i + self.chunk_size]
            chunks.append(DocumentChunk(
                content=self._detokenize(window),
                metadata={**section["metadata"], "offset": i}
            ))
            i += self.chunk_size - self.overlap
        return chunks
```

### 2. 向量知识库：检索增强生成 (RAG)

```python
# knowledge_base.py
import numpy as np
from typing import List, Tuple

class KnowledgeBase:
    """本地向量知识库"""

    def __init__(self, embedding_model: str = "text-embedding-3-small"):
        self.chunks: List[DocumentChunk] = []
        self.index = None  # FAISS 索引
        self.embedding_model = embedding_model

    def add_document(self, chunks: List[DocumentChunk]):
        """将文档切片加入知识库"""
        # 1. 批量生成向量嵌入
        embeddings = self._batch_embed([c.content for c in chunks])

        # 2. 存储切片 + 构建 ANN 索引
        for chunk, emb in zip(chunks, embeddings):
            chunk.embedding = emb
            self.chunks.append(chunk)

        self._build_index()

    def search(self, query: str, top_k: int = 5) -> List[Tuple[DocumentChunk, float]]:
        """语义检索：返回最相关的切片"""
        query_emb = self._embed(query)
        scores, indices = self.index.search(
            np.array([query_emb]), top_k
        )
        return [(self.chunks[i], float(s)) for i, s in zip(indices[0], scores[0])]

    def _build_index(self):
        """构建 FAISS 近似最近邻索引"""
        import faiss
        dim = len(self.chunks[0].embedding)
        vectors = np.array([c.embedding for c in self.chunks]).astype('float32')

        # 10万+ 切片使用 IVF 索引加速检索
        nlist = min(100, len(self.chunks) // 10)
        quantizer = faiss.IndexFlatIP(dim)
        self.index = faiss.IndexIVFFlat(quantizer, dim, nlist)
        self.index.train(vectors)
        self.index.add(vectors)
```

### 3. QA 问答：检索 + 阅读理解

```python
# qa_engine.py
class QAEngine:
    """知识库问答引擎"""

    def __init__(self, knowledge_base: KnowledgeBase, llm_client):
        self.kb = knowledge_base
        self.llm = llm_client

    async def answer(self, question: str) -> dict:
        """端到端问答流程"""

        # Step 1: 意图识别 - 判断是否需要检索
        intent = await self._classify_intent(question)

        # Step 2: 多路检索
        retrieved = []
        if intent == "factual":
            # 精确检索：语义搜索 + 关键词匹配
            semantic_results = self.kb.search(question, top_k=5)
            keyword_results = self.kb.keyword_search(question, top_k=3)
            retrieved = self._merge_and_dedupe(semantic_results, keyword_results)
        elif intent == "summary":
            # 摘要检索：按章节召回
            retrieved = self.kb.search_by_section(question, top_k=10)

        # Step 3: 上下文组装（控制 token 预算）
        context = self._assemble_context(retrieved, max_tokens=3000)

        # Step 4: LLM 生成答案
        answer = await self.llm.chat(
            messages=[
                {"role": "system", "content": "你是文档问答助手，根据提供的上下文回答问题。"},
                {"role": "user", "content": f"上下文：\n{context}\n\n问题：{question}"}
            ],
            stream=True  # 流式输出（结合题目二）
        )

        # Step 5: 引用溯源
        citations = [
            {"text": chunk.content[:100], "source": chunk.metadata}
            for chunk, score in retrieved[:3]
            if score > 0.7
        ]

        return {"answer": answer, "citations": citations}

    def _assemble_context(self, chunks, max_tokens=3000):
        """智能上下文组装：相关度排序 + token 预算控制"""
        context_parts = []
        total_tokens = 0
        for chunk, score in sorted(chunks, key=lambda x: -x[1]):
            chunk_tokens = self._count_tokens(chunk.content)
            if total_tokens + chunk_tokens > max_tokens:
                break
            context_parts.append(f"[相关度:{score:.2f}] {chunk.content}")
            total_tokens += chunk_tokens
        return "\n---\n".join(context_parts)
```

### 4. 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                        用户界面层                            │
│  ┌──────────┐  ┌──────────────┐  ┌────────────────────┐    │
│  │ 文档上传  │  │  阅读器视图   │  │  QA 对话界面       │    │
│  └────┬─────┘  └──────┬───────┘  └─────────┬──────────┘    │
│       │               │                     │               │
├───────┼───────────────┼─────────────────────┼───────────────┤
│       ▼               ▼                     ▼               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                   服务层                              │    │
│  │  ┌──────────────┐  ┌─────────────┐  ┌────────────┐ │    │
│  │  │ 文档处理器    │  │  知识库      │  │  QA 引擎   │ │    │
│  │  │ (分层切片)    │  │  (向量检索)  │  │  (RAG)     │ │    │
│  │  └──────┬───────┘  └──────┬──────┘  └─────┬──────┘ │    │
│  │         │                 │                │        │    │
│  │         ▼                 ▼                ▼        │    │
│  │  ┌──────────────────────────────────────────────┐  │    │
│  │  │              存储层                            │  │    │
│  │  │  ┌──────────┐  ┌──────────┐  ┌───────────┐  │  │    │
│  │  │  │ 文档原文  │  │ 向量索引  │  │ 对话历史   │  │  │    │
│  │  │  │ (SQLite)  │  │ (FAISS)  │  │ (SQLite)  │  │  │    │
│  │  │  └──────────┘  └──────────┘  └───────────┘  │  │    │
│  │  └──────────────────────────────────────────────┘  │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

**核心流程**：
1. 用户上传 10 万字文档 → 文档处理器进行三级切片
2. 切片生成向量嵌入 → 存入 FAISS 索引
3. 用户提问 → 多路检索相关切片
4. 组装上下文 + 问题 → LLM 流式生成答案
5. 引用溯源 → 显示答案来源的原文片段

---

## 技术栈总结

| 层级 | 技术选型 |
|------|----------|
| 前端框架 | Vue 3 + TypeScript + Vite |
| UI 组件 | Element Plus |
| 后端插件 | Python 3.10+ (JSON-RPC over stdin/stdout) |
| 应用平台 | Anna App (manifest schema 2) |
| 向量检索 | FAISS (IVFFlat) |
| 嵌入模型 | text-embedding-3-small |
| 协同编辑 | WebSocket + 向量时钟 + OT |
| 流式输出 | SSE / WebSocket + 逐字渲染 |
