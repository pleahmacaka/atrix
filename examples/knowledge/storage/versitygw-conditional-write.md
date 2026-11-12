---
id: kg_01M77CAJSNBTT3ZFZQVNS8YMFG
title: versitygw 조건부 쓰기 동작
description: If-Match로 동시 수정을 막는 방식
tags:
  - storage
  - s3
scope: network
links:
  - to: kg_01M77CAJSN0ES2AWBDX20NKS3W
    rel: depends_on
created_at: 2026-11-12T14:03:21+09:00
updated_at: 2026-11-12T15:40:02+09:00
base_hash: blake3:606ec154e4634e71c6bc67b6614417192a7e7ac2944523c1a55435f1b7c54f47
created_by: &a1
  kind: agent
  agent: claude-design-1
  session: atrix:85ec7709-1790-4891-8e1c-ead6df2608c7
  device: daeeun-desktop
  harness:
    name: claude-agent-acp
    version: 0.106.0
  model:
    id: claude-haiku-4-5
    vendor: anthropic
  route:
    - kind: provider
      name: anthropic
updated_by: *a1
---
# 조건부 쓰기

수정할 때는 읽어온 ETag를 `If-Match`에 붙입니다. 버전 관리는 [[kg_01M77CAJSN0ES2AWBDX20NKS3W]]를 따릅니다.
