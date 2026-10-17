#!/usr/bin/env python3

import json
import os
import subprocess
import sys

# Standard clangd LSP token list
LSP_TOKEN_TYPES = [
    "namespace",
    "type",
    "class",
    "enum",
    "interface",
    "struct",
    "typeParameter",
    "parameter",
    "variable",
    "property",
    "enumMember",
    "event",
    "function",
    "method",
    "macro",
    "keyword",
    "modifier",
    "comment",
    "string",
    "number",
    "regexp",
    "operator",
    "concept",
]

LSP_TOKEN_MODIFIERS = [
    "declaration",
    "definition",
    "readonly",
    "static",
    "deprecated",
    "abstract",
    "async",
    "modification",
    "documentation",
    "defaultLibrary",
    "usedAsMutableReference",
    "usedAsMutablePointer",
    "constructorOrDestructor",
    "userDefined",
    "functionScope",
    "classScope",
    "fileScope",
    "globalScope",
]


class ClangdClient:

  def __init__(self):
    cmd = [
        "clangd",
        "--log=error",
        "--background-index=false",
        "--pch-storage=memory",
    ]
    self.proc = subprocess.Popen(
        cmd,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    self.req_id = 0

  def _die_with_stderr(self, msg):
    assert self.proc.stderr is not None
    stderr_out = self.proc.stderr.read().decode("utf-8", errors="replace")
    raise RuntimeError(
        f"{msg}\n[clangd exit code: {self.proc.poll()}]\n[stderr]:\n{stderr_out}"
    )

  def _send(self, payload):
    if self.proc.poll() is not None:
      self._die_with_stderr("clangd stopped unexpectedly before sending request.")
    body = json.dumps(payload).encode("utf-8")
    header = f"Content-Length: {len(body)}\r\n\r\n".encode("ascii")
    assert self.proc.stdin is not None
    self.proc.stdin.write(header + body)
    self.proc.stdin.flush()

  def _read(self):
    content_length = None
    assert self.proc.stdout is not None
    while True:
      line = self.proc.stdout.readline()
      if not line:  # EOF -> child process died
        self._die_with_stderr("EOF when reading LSP header from clangd.")
      line_str = line.decode("ascii", errors="replace").strip()
      if not line_str:  # Emtpy line signal ending Header (\r\n\r\n)
        break
      if line_str.lower().startswith("content-length:"):
        content_length = int(line_str.split(":", 1)[1].strip())

    if content_length is None:
      self._die_with_stderr("LSP frame does have Content-Length header.")

    body = b""
    while len(body) < content_length:
      chunk = self.proc.stdout.read(content_length - len(body))
      if not chunk:
        self._die_with_stderr("EOF when reading LSP body from clangd.")
      body += chunk

    return json.loads(body.decode("utf-8"))

  def call(self, method, params):
    self.req_id += 1
    current_id = self.req_id
    self._send(
        {"jsonrpc": "2.0", "id": current_id, "method": method, "params": params}
    )
    while True:
      msg = self._read()
      # Skip notification from server
      if msg.get("id") == current_id:
        if "error" in msg:
          raise RuntimeError(f"LSP Error ({method}): {msg['error']}")
        return msg.get("result")

  def notify(self, method, params):
    self._send({"jsonrpc": "2.0", "method": method, "params": params})

  def close(self):
    if self.proc.poll() is None:
      self.proc.terminate()
      self.proc.wait(timeout=2)


def parse_semantic_tokens(file_path):
  abs_path = os.path.abspath(file_path)
  with open(abs_path, "r", encoding="utf-8") as f:
    source_code = f.read()
  lines = source_code.splitlines()

  client = ClangdClient()
  try:
    # 1. Initialize with fallbackFlags through initializationOptions
    init_res = client.call(
        "initialize",
        {
            "processId": os.getpid(),
            "rootUri": f"file://{os.path.dirname(abs_path)}",
            "initializationOptions": {
                "fallbackFlags": ["-std=c++20", "-xc++", "-Wall"]
            },
            "capabilities": {
                "textDocument": {
                    "semanticTokens": {
                        "requests": {"full": True},
                        "tokenTypes": LSP_TOKEN_TYPES,
                        "tokenModifiers": LSP_TOKEN_MODIFIERS,
                        "formats": ["relative"],
                    }
                }
            },
        },
    )
    client.notify("initialized", {})

    legend = init_res["capabilities"]["semanticTokensProvider"]["legend"]
    token_types = legend["tokenTypes"]
    token_modifiers = legend["tokenModifiers"]

    # 2. Open fixture source file
    file_uri = f"file://{abs_path}"
    client.notify(
        "textDocument/didOpen",
        {
            "textDocument": {
                "uri": file_uri,
                "languageId": "cpp",
                "version": 1,
                "text": source_code,
            }
        },
    )

    # 3. Request Semantic Tokens (clangd waits until AST finished build then returns)
    res = client.call(
        "textDocument/semanticTokens/full", {"textDocument": {"uri": file_uri}}
    )
  finally:
    client.close()

  if not res or "data" not in res:
    print("Cannot receive semantic tokens data.", file=sys.stderr)
    return

  raw_data = res["data"]
  current_line = 0
  current_col = 0

  print("| Line:Col | Concrete Token | Semantic Type | Semantic Modifiers |")
  print("| :--- | :--- | :--- | :--- |")

  for i in range(0, len(raw_data), 5):
    delta_line, delta_start, length, type_idx, mod_mask = raw_data[i : i + 5]

    if delta_line > 0:
      current_line += delta_line
      current_col = delta_start
    else:
      current_col += delta_start

    token_text = lines[current_line][current_col : current_col + length]
    semantic_type = (
        token_types[type_idx]
        if type_idx < len(token_types)
        else f"unknown({type_idx})"
    )

    active_mods = [
        token_modifiers[bit]
        for bit in range(len(token_modifiers))
        if mod_mask & (1 << bit)
    ]
    mod_str = f"[{', '.join(active_mods)}]" if active_mods else "[]"

    print(
        f"| {current_line + 1}:{current_col + 1} | `{token_text}` |"
        f" `{semantic_type}` | `{mod_str}` |"
    )


if __name__ == "__main__":
  if len(sys.argv) < 2:
    print("Usage: python3 dump_tokens.py <path_to_fixture.cpp>")
    sys.exit(1)
  parse_semantic_tokens(sys.argv[1])
