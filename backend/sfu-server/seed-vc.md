# Seed-VC Streaming API 仕様書

## 概要

Seed-VC Streaming APIは、ゼロショット音声変換をチャンク単位で処理するHTTP APIサーバーです。
クライアントが音声を小さなチャンク(例: 500ms)に分割して順次送信し、サーバーが各チャンクを変換して返すことで、低レイテンシなストリーミング処理を実現します。

- **ベースURL**: `https://akatuki25-seed-vc-streaming.hf.space`
- **モデル**: Seed-VC (Plachtaa/seed-vc)
- **入力サンプルレート**: 16000Hz (推奨)
- **出力サンプルレート**: 22050Hz
- **推奨チャンクサイズ**: 500ms (overlap 100ms)
- **プリセット参照音声**: デフォルトで`default_female`が利用可能(カスタム音声のアップロードも可)

---

## アーキテクチャ

### ストリーミング処理フロー

```
クライアント側:
1. 音声をチャンク分割 (500ms × N個)
2. セッション作成 → session_id取得
3. (オプション) カスタム参照音声アップロード
   ※プリセット参照音声を使う場合はスキップ
4. チャンクを順次送信 (chunk_0, chunk_1, ...)
5. 各レスポンスを受信・結合
6. セッション終了

サーバー側:
1. セッション管理 (参照音声の特徴量をキャッシュ)
   ※プリセット使用時はHF Datasetから自動ダウンロード
2. 各チャンクを独立に変換
3. クロスフェード処理 (overlap_msで指定)
4. 変換後チャンクを即座に返却
```

### 重要な設計ポイント

- **チャンク単位処理**: `/chunk`エンドポイントは1回のリクエストで1チャンクのみ処理・返却
- **クライアント側結合**: 全チャンクを受信後、クライアントが`np.concatenate()`等で結合
- **サーバー側クロスフェード**: `overlap_ms`で指定した重複部分を自動的にクロスフェード
- **セッション状態**: 参照音声の特徴量、前回チャンクの末尾を保持

---

## エンドポイント仕様

### 1. GET /health

ヘルスチェック用エンドポイント

**リクエスト**
```bash
GET /health
```

**レスポンス**
```json
{
  "status": "ok"
}
```

---

### 2. POST /session

新しい変換セッションを作成

**リクエスト**
```bash
POST /session
Content-Type: application/json

{
  "sample_rate": 16000,
  "tgt_speaker_id": null,
  "ref_preset_id": null,
  "use_uploaded_ref": true,
  "chunk_len_ms": 500,
  "overlap_ms": 100
}
```

**パラメータ**
| フィールド | 型 | 必須 | デフォルト | 説明 |
|-----------|-----|------|-----------|------|
| `sample_rate` | int | No | 16000 | 入力音声のサンプルレート (Hz) |
| `tgt_speaker_id` | str | No | null | ターゲット話者ID (未使用) |
| `ref_preset_id` | str | No | "default_female" | プリセット参照音声ID ("default_female", "default_male") |
| `use_uploaded_ref` | bool | No | false | 参照音声をアップロードする場合true。falseの場合はref_preset_idを使用 |
| `chunk_len_ms` | int | No | 1000 | チャンク長 (ミリ秒) |
| `overlap_ms` | int | No | 200 | チャンク間のオーバーラップ (ミリ秒) |

**レスポンス**
```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "sample_rate": 16000,
  "chunk_len_ms": 500,
  "overlap_ms": 100
}
```

---

### 3. POST /session/ref

参照音声(ターゲット話者音声)をアップロード

**リクエスト**
```bash
POST /session/ref
Content-Type: multipart/form-data

session_id: <session_id>
ref_audio: <WAVファイル>
```

**パラメータ**
| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `session_id` | str | Yes | セッションID |
| `ref_audio` | file | Yes | 参照音声WAVファイル (任意のサンプルレート、自動リサンプル) |

**レスポンス**
```json
{
  "status": "ok"
}
```

**処理内容**
- 参照音声を22050Hzにリサンプル
- 最大25秒に切り詰め
- Whisperセマンティック特徴量を抽出
- CAMPPlusスタイル埋め込みを計算
- メルスペクトログラムを生成
- セッションに紐付けて保存

---

### 4. POST /chunk

音声チャンクを変換

**リクエスト**
```bash
POST /chunk
Content-Type: multipart/form-data

session_id: <session_id>
chunk_id: <chunk_id>
audio: <WAVファイル>
```

**パラメータ**
| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `session_id` | str | Yes | セッションID |
| `chunk_id` | int | Yes | チャンクID (0始まりの連番) |
| `audio` | file | Yes | 音声チャンクWAVファイル |

**レスポンス**
```
Content-Type: audio/wav
X-Chunk-Id: <chunk_id>

<WAVバイナリデータ>
```

**処理フロー**
1. 音声チャンクを読み込み (セッションのsample_rateと一致確認)
2. Seed-VCで音声変換
   - Whisperセマンティック特徴抽出
   - Length Regulator適用
   - CFM (Conditional Flow Matching) で推論
   - BigVGAN Vocoderで音声生成
3. 前回チャンクの末尾とクロスフェード (`overlap_ms`分)
4. 変換後チャンクを返却 (22050Hz WAV)

**重要**: このエンドポイントは**1チャンクのみ**を返します。全体音声を得るにはクライアント側で結合が必要です。

---

### 5. POST /end

セッションを終了

**リクエスト**
```bash
POST /end
Content-Type: application/json

{
  "session_id": "<session_id>"
}
```

**レスポンス**
```json
{
  "status": "ended"
}
```

---

## 使用例

### Python完全実装例

#### パターンA: プリセット参照音声を使用(推奨)

```python
import requests
import numpy as np
import soundfile as sf
import io

# ====================
# 設定
# ====================
API_BASE = "https://akatuki25-seed-vc-streaming.hf.space"
SOURCE_AUDIO = "source.wav"  # 変換したい音声
OUTPUT_AUDIO = "output.wav"

SAMPLE_RATE = 16000
CHUNK_LEN_MS = 500
OVERLAP_MS = 100

# ====================
# 1. 音声読み込み
# ====================
source, sr = sf.read(SOURCE_AUDIO)
if sr != SAMPLE_RATE:
    import librosa
    source = librosa.resample(source, orig_sr=sr, target_sr=SAMPLE_RATE)

# ====================
# 2. セッション作成(プリセット参照音声使用)
# ====================
resp = requests.post(f"{API_BASE}/session", json={
    "sample_rate": SAMPLE_RATE,
    "use_uploaded_ref": False,  # プリセットを使用
    "ref_preset_id": "default_female",  # 省略可(デフォルト)
    "chunk_len_ms": CHUNK_LEN_MS,
    "overlap_ms": OVERLAP_MS
})
session_id = resp.json()["session_id"]
print(f"Session created: {session_id}")

# 3. 参照音声アップロードは不要(プリセット使用時)

# ====================
# 4. チャンク分割
# ====================
chunk_len_samples = int(SAMPLE_RATE * CHUNK_LEN_MS / 1000)
chunks = []
for i in range(0, len(source), chunk_len_samples):
    chunk = source[i:i + chunk_len_samples]
    chunks.append(chunk)

print(f"Split into {len(chunks)} chunks")

# ====================
# 5. チャンク順次送信・受信
# ====================
output_chunks = []

for chunk_id, chunk in enumerate(chunks):
    # WAVバイト列に変換
    buffer = io.BytesIO()
    sf.write(buffer, chunk, SAMPLE_RATE, format="WAV", subtype="PCM_16")
    buffer.seek(0)

    # POSTリクエスト
    resp = requests.post(f"{API_BASE}/chunk",
                        data={"session_id": session_id, "chunk_id": chunk_id},
                        files={"audio": ("chunk.wav", buffer, "audio/wav")})

    # 変換後チャンク取得
    converted_chunk, conv_sr = sf.read(io.BytesIO(resp.content))
    output_chunks.append(converted_chunk)

    print(f"Chunk {chunk_id}/{len(chunks)-1} processed")

# ====================
# 6. チャンク結合
# ====================
output_audio = np.concatenate(output_chunks)
sf.write(OUTPUT_AUDIO, output_audio, 22050)
print(f"Output saved: {OUTPUT_AUDIO}")

# ====================
# 7. セッション終了
# ====================
requests.post(f"{API_BASE}/end", json={"session_id": session_id})
print("Session ended")
```

#### パターンB: カスタム参照音声をアップロード

```python
import requests
import numpy as np
import soundfile as sf
import io

# ====================
# 設定
# ====================
API_BASE = "https://akatuki25-seed-vc-streaming.hf.space"
SOURCE_AUDIO = "source.wav"  # 変換したい音声
REF_AUDIO = "target_speaker.wav"  # ターゲット話者の参照音声
OUTPUT_AUDIO = "output.wav"

SAMPLE_RATE = 16000
CHUNK_LEN_MS = 500
OVERLAP_MS = 100

# ====================
# 1. 音声読み込み
# ====================
source, sr = sf.read(SOURCE_AUDIO)
if sr != SAMPLE_RATE:
    import librosa
    source = librosa.resample(source, orig_sr=sr, target_sr=SAMPLE_RATE)

# ====================
# 2. セッション作成(カスタム参照音声)
# ====================
resp = requests.post(f"{API_BASE}/session", json={
    "sample_rate": SAMPLE_RATE,
    "use_uploaded_ref": True,  # カスタム参照音声を使用
    "chunk_len_ms": CHUNK_LEN_MS,
    "overlap_ms": OVERLAP_MS
})
session_id = resp.json()["session_id"]
print(f"Session created: {session_id}")

# ====================
# 3. 参照音声アップロード
# ====================
with open(REF_AUDIO, "rb") as f:
    resp = requests.post(f"{API_BASE}/session/ref",
                        data={"session_id": session_id},
                        files={"ref_audio": f})
print("Reference audio uploaded")

# 4〜7は同じ (チャンク分割、送信、結合、終了)
# ...
```

### curlを使った例

#### パターンA: プリセット参照音声を使用

```bash
#!/bin/bash

API_BASE="https://akatuki25-seed-vc-streaming.hf.space"

# 1. セッション作成(プリセット参照音声使用)
SESSION=$(curl -s -X POST "$API_BASE/session" \
  -H "Content-Type: application/json" \
  -d '{"sample_rate":16000,"use_uploaded_ref":false,"ref_preset_id":"default_female","chunk_len_ms":500,"overlap_ms":100}' \
  | jq -r '.session_id')

echo "Session: $SESSION"

# 2. 参照音声アップロードは不要

# 3. チャンク送信 (例: chunk_0)
curl -X POST "$API_BASE/chunk" \
  -F "session_id=$SESSION" \
  -F "chunk_id=0" \
  -F "audio=@chunk_0.wav" \
  -o output_chunk_0.wav

# 4. セッション終了
curl -X POST "$API_BASE/end" \
  -H "Content-Type: application/json" \
  -d "{\"session_id\":\"$SESSION\"}"
```

#### パターンB: カスタム参照音声をアップロード

```bash
#!/bin/bash

API_BASE="https://akatuki25-seed-vc-streaming.hf.space"

# 1. セッション作成
SESSION=$(curl -s -X POST "$API_BASE/session" \
  -H "Content-Type: application/json" \
  -d '{"sample_rate":16000,"use_uploaded_ref":true,"chunk_len_ms":500,"overlap_ms":100}' \
  | jq -r '.session_id')

echo "Session: $SESSION"

# 2. 参照音声アップロード
curl -X POST "$API_BASE/session/ref" \
  -F "session_id=$SESSION" \
  -F "ref_audio=@target_speaker.wav"

# 3. チャンク送信 (例: chunk_0)
curl -X POST "$API_BASE/chunk" \
  -F "session_id=$SESSION" \
  -F "chunk_id=0" \
  -F "audio=@chunk_0.wav" \
  -o output_chunk_0.wav

# 4. セッション終了
curl -X POST "$API_BASE/end" \
  -H "Content-Type: application/json" \
  -d "{\"session_id\":\"$SESSION\"}"
```

---

## クロスフェード処理

サーバー側で自動的に処理されます。

### 仕組み

```
チャンク0:  [=============================]
                              ↓ overlap_ms (100ms)
チャンク1:                [=============================]
                          |<-fade->|

出力0: [========================]  (fade-outなし)
出力1:                [==|fade-in|==================]

最終結合: [========================================]
```

### パラメータ調整

| overlap_ms | 効果 | 推奨用途 |
|-----------|------|---------|
| 0 | クロスフェードなし | デバッグ用 |
| 50 | 最小限の平滑化 | 超低レイテンシ優先 |
| 100 | 標準 | バランス型 |
| 200 | 高品質 | 音質優先 |

---

## パフォーマンス特性

### レイテンシ測定結果

**環境**: Hugging Face Spaces (NVIDIA T4 GPU)

| チャンクサイズ | 初回処理時間 | 2回目以降 | RTF (Real-Time Factor) |
|--------------|-------------|----------|----------------------|
| 100ms | ~2.0秒 | ~0.5秒 | ~5.0x |
| 200ms | ~2.0秒 | ~0.7秒 | ~3.5x |
| 500ms | ~2.0秒 | ~1.0秒 | ~2.0x |
| 1000ms | ~2.5秒 | ~1.5秒 | ~1.5x |

**RTF**: レイテンシ ÷ 入力音声長。1.0未満でリアルタイム処理可能。

### 推奨設定

```json
{
  "chunk_len_ms": 500,
  "overlap_ms": 100
}
```

**理由**:
- 初回ウォームアップ後、RTF ~2.0x (実用的)
- 適度なクロスフェード品質
- ネットワークオーバーヘッドとのバランス

---

## エラーハンドリング

### HTTP 400 エラー

```json
{
  "detail": "Invalid session_id"
}
```

**原因**:
- セッションIDが存在しない
- セッションが期限切れ (600秒無操作)

**対処**: 新しいセッションを作成

---

```json
{
  "detail": "Sample rate mismatch: expected 16000, got 44100"
}
```

**原因**: チャンクのサンプルレートがセッション作成時と異なる

**対処**: 音声を正しいサンプルレートにリサンプル

---

### HTTP 500 エラー

**原因**: サーバー内部エラー (モデル推論失敗等)

**対処**:
1. チャンク長を変更して再試行
2. 参照音声を別のものに変更
3. 数秒待ってリトライ

---

## ベストプラクティス

### 1. 参照音声の選び方

#### プリセット参照音声を使う場合(推奨)

```python
# デフォルトプリセット使用(最も簡単)
resp = requests.post(f"{API_BASE}/session", json={
    "sample_rate": 16000,
    "use_uploaded_ref": False  # プリセット使用
})

# または明示的に指定
resp = requests.post(f"{API_BASE}/session", json={
    "sample_rate": 16000,
    "use_uploaded_ref": False,
    "ref_preset_id": "default_female"  # or "default_male"
})
```

**メリット**:
- アップロード不要で即座に利用可能
- 安定した品質の参照音声
- ネットワーク帯域を節約

#### カスタム参照音声をアップロードする場合

- **長さ**: 3〜10秒推奨 (最大25秒まで自動切り詰め)
- **品質**: クリーンな音声 (ノイズ・エコー少ない)
- **内容**: 単一話者、自然な発話

### 2. チャンク分割

```python
# ❌ 悪い例: オーバーラップ考慮なし
chunks = [audio[i:i+chunk_len] for i in range(0, len(audio), chunk_len)]

# ✅ 良い例: オーバーラップなし(サーバー側で処理)
chunk_len_samples = int(SAMPLE_RATE * CHUNK_LEN_MS / 1000)
chunks = [audio[i:i+chunk_len_samples]
          for i in range(0, len(audio), chunk_len_samples)]
```

**重要**: クライアント側でオーバーラップを持たせる必要はありません。サーバーが前回チャンクの末尾を保持してクロスフェード処理します。

### 3. セッション管理

```python
# セッション再利用(同一話者の複数音声変換)
for source_file in source_files:
    # チャンク処理...
    pass
# 最後に1回だけ終了
requests.post(f"{API_BASE}/end", json={"session_id": session_id})
```

### 4. エラーリトライ

```python
import time

MAX_RETRIES = 3
for attempt in range(MAX_RETRIES):
    try:
        resp = requests.post(f"{API_BASE}/chunk", ...)
        resp.raise_for_status()
        break
    except requests.RequestException as e:
        if attempt == MAX_RETRIES - 1:
            raise
        time.sleep(2 ** attempt)  # Exponential backoff
```

---

## 技術詳細

### モデルコンポーネント

1. **Whisper (semantic feature extractor)**
   - 入力: 16kHz音声
   - 出力: セマンティック特徴量

2. **CAMPPlus (speaker encoder)**
   - 入力: 16kHz音声のFbank特徴量
   - 出力: 話者埋め込みベクトル

3. **DiT-based Flow Matching Model**
   - 入力: セマンティック特徴 + 話者埋め込み
   - 出力: メルスペクトログラム
   - 推論ステップ数: 10
   - CFG rate: 0.7

4. **BigVGAN Vocoder**
   - 入力: メルスペクトログラム
   - 出力: 22050Hz音声波形

### サンプルレート変換フロー

```
入力音声 (16kHz)
    ↓
Seed-VC内部リサンプル (22050Hz)
    ↓
Whisper用ダウンサンプル (16kHz)
    ↓
推論処理 (22050Hz mel)
    ↓
Vocoder出力 (22050Hz)
```

---

## 制限事項

1. **リアルタイム性**: GPU環境でもRTF > 1.0 (完全なリアルタイム処理は不可)
2. **セッションタイムアウト**: 600秒無操作で自動削除
3. **参照音声長**: 最大25秒まで
4. **同時セッション数**: Hugging Face Spacesの制限に依存
5. **GPU必須**: CPU環境ではRTF 20〜60x (実用不可)

---

## FAQ

### Q: チャンクサイズを小さくすればレイテンシは下がる?

A: 初回コールドスタートのオーバーヘッド(~2秒)が支配的なため、100ms以下にしても劇的な改善はありません。500msが推奨です。

### Q: クライアント側でクロスフェードする必要は?

A: 不要です。サーバーが`overlap_ms`に基づいて自動処理します。受信したチャンクをそのまま結合してください。

### Q: 複数セッションを同時に使える?

A: 可能ですが、各セッションは独立してGPUメモリを消費します。Hugging Face Spacesの無料枠では同時1〜2セッションが現実的です。

### Q: CPUモードで動作する?

A: 動作しますが、RTF 20〜60xと実用的ではありません。GPU環境必須です。

---

## サポート・問い合わせ

- **リポジトリ**: https://huggingface.co/spaces/akatukiseed/seed-vc-streaming
- **ベースモデル**: https://github.com/Plachtaa/seed-vc
- **Hugging Face Space**: https://akatukiseed-seed-vc-streaming.hf.space

---

## 変更履歴

| バージョン | 日付 | 変更内容 |
|----------|------|---------|
| 1.0.0 | 2025-11-22 | 初版リリース |
