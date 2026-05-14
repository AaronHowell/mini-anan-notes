#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
import threading
from datetime import datetime, timezone
from typing import Any, Dict, List


TOOL_NAME = "summarize_notes"

MANIFEST = {
    "name": "mini-notes",
    "display_name": "Mini Notes",
    "version": "0.1.0",
    "description": "Local Mini Notes Executa tool.",
    "author": "Anna Developer",
    "tools": [
        {
            "name": TOOL_NAME,
            "description": "Summarize notes with simple rule-based logic.",
            "parameters": [
                {
                    "name": "notes",
                    "type": "array",
                    "description": "Notes to summarize.",
                    "required": True,
                }
            ],
        }
    ],
    "runtime": {
        "type": "uv",
        "min_version": "0.1.0",
    },
}


_stdout_lock = threading.Lock()


def write_frame(msg: Dict[str, Any]) -> None:
    payload = json.dumps(msg, ensure_ascii=False)

    with _stdout_lock:
        sys.stdout.write(payload + "\n")
        sys.stdout.flush()


def make_response(
    req_id: Any,
    *,
    result: Any = None,
    error: Any = None,
) -> Dict[str, Any]:
    out: Dict[str, Any] = {
        "jsonrpc": "2.0",
        "id": req_id,
    }

    if error is not None:
        out["error"] = error
    else:
        out["result"] = result

    return out


def handle_initialize(req_id: Any, params: Dict[str, Any]) -> Dict[str, Any]:
    protocol_version = (params or {}).get("protocolVersion") or "1.1"

    if protocol_version not in ("1.1", "2.0"):
        protocol_version = "2.0"

    return make_response(
        req_id,
        result={
            "protocolVersion": protocol_version,
            "serverInfo": {
                "name": MANIFEST["name"],
                "version": MANIFEST["version"],
            },
            "client_capabilities": {},
            "capabilities": {},
        },
    )


def handle_describe(req_id: Any) -> Dict[str, Any]:
    return make_response(req_id, result=MANIFEST)


def handle_health(req_id: Any) -> Dict[str, Any]:
    return make_response(
        req_id,
        result={
            "status": "healthy",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "version": MANIFEST["version"],
        },
    )


def normalize_notes(raw_notes: Any) -> List[Dict[str, Any]]:
    if not isinstance(raw_notes, list):
        raise ValueError("notes must be a list")

    notes: List[Dict[str, Any]] = []

    for index, item in enumerate(raw_notes):
        if isinstance(item, str):
            content = item.strip()
            note = {
                "id": f"note-{index + 1}",
                "content": content,
                "order": index + 1,
            }
        elif isinstance(item, dict):
            content = str(item.get("content", "")).strip()
            note = {
                "id": str(item.get("id", f"note-{index + 1}")),
                "content": content,
                "order": item.get("order", index + 1),
                "createdAt": item.get("createdAt"),
            }
        else:
            raise ValueError(f"notes[{index}] must be an object or string")

        if content:
            notes.append(note)

    return notes


def summarize_notes(notes: List[Dict[str, Any]]) -> Dict[str, Any]:
    count = len(notes)

    if count == 0:
        return {
            "summary": "当前还没有笔记。",
            "count": 0,
            "categories": [],
        }

    joined = " ".join(note["content"] for note in notes).lower()

    categories: List[str] = []

    if any(word in joined for word in ["bug", "修复", "登录", "代码", "开发", "接口"]):
        categories.append("开发")

    if any(word in joined for word in ["设计", "沟通", "需求", "讨论", "同步", "协作"]):
        categories.append("协作")

    if any(word in joined for word in ["workshop", "提纲", "内容", "文档", "材料"]):
        categories.append("内容准备")

    if any(word in joined for word in ["客户", "follow up", "跟进", "邮件", "合同"]):
        categories.append("客户跟进")

    if not categories:
        categories.append("日常事项")

    return {
        "summary": f"当前共有 {count} 条笔记，主要集中在{'、'.join(categories)}。",
        "count": count,
        "categories": categories,
    }


def handle_invoke(req_id: Any, params: Dict[str, Any]) -> Dict[str, Any]:
    """
    Anna App UI SDK uses:
      anna.tools.invoke({
        tool_id,
        method,
        args
      })

    The bridge may forward this to the plugin as either:
      params.tool / params.arguments
    or:
      params.method / params.args

    So we support both.
    """
    tool = (
        params.get("tool")
        or params.get("method")
        or params.get("name")
    )

    args = (
        params.get("arguments")
        or params.get("args")
        or {}
    )

    if tool != TOOL_NAME:
        return make_response(
            req_id,
            error={
                "code": -32601,
                "message": f"Unknown tool: {tool}",
            },
        )

    try:
        notes = normalize_notes(args.get("notes", []))
        data = summarize_notes(notes)

        return make_response(
            req_id,
            result={
                "success": True,
                "tool": TOOL_NAME,
                "data": data,
            },
        )
    except Exception as exc:
        return make_response(
            req_id,
            error={
                "code": -32602,
                "message": "Invalid params",
                "data": {
                    "detail": str(exc),
                },
            },
        )


def handle_message(line: str) -> None:
    try:
        msg = json.loads(line)
    except json.JSONDecodeError:
        write_frame(
            make_response(
                None,
                error={
                    "code": -32700,
                    "message": "Parse error",
                },
            )
        )
        return

    method = msg.get("method")
    req_id = msg.get("id")
    params = msg.get("params") or {}

    if method == "initialize":
        response = handle_initialize(req_id, params)#?
    elif method == "describe":
        response = handle_describe(req_id)
    elif method == "health":
        response = handle_health(req_id)
    elif method == "invoke":
        response = handle_invoke(req_id, params)
    elif method == "shutdown":
        response = make_response(req_id, result={"ok": True})
    else:
        response = make_response(
            req_id,
            error={
                "code": -32601,
                "message": f"Method not found: {method}",
            },
        )

    if req_id is not None:
        write_frame(response)


def main() -> None:
    print("mini-notes plugin started", file=sys.stderr) #日志输出到stderr，确保与协议通信的stdout保持干净

    for raw in sys.stdin:
        line = raw.strip()

        if not line:
            continue

        handle_message(line)


if __name__ == "__main__":
    main()