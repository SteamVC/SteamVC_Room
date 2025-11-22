'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Mic, Square, Download, RefreshCw, ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { convertBlobToWav } from '@/lib/wav';
import { WAV_UPLOAD_URL } from '@/lib/endpoints';

const defaultScript =
  process.env.NEXT_PUBLIC_DEFAULT_SCRIPT ||
  'この文章は声質変換用の録音テストです。マイクから一定の距離を保って話してください。';

function VoiceRecorderContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get('next');
  const nextLabel = searchParams.get('nextLabel') || (nextPath ? '次へ進む' : 'ホームに戻る');
  const [scriptText, setScriptText] = useState(defaultScript);
  const [isRecording, setIsRecording] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('マイクの準備を開始できます。');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [recordedScript, setRecordedScript] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const wavBlobRef = useRef<Blob | null>(null);

  const downloadFileName = 'voice-sample.wav';

  const cleanupStream = () => {
    mediaRecorderRef.current = null;
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      cleanupStream();
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  const handleStartRecording = async () => {
    if (isRecording || isConverting) return;
    setErrorMessage(null);
    setStatusMessage('マイクを初期化しています...');

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setErrorMessage('ブラウザが録音に対応していません。Chrome や Edge を使用してください。');
        setStatusMessage('録音に対応していないため開始できません。');
        return;
      }
      if (typeof MediaRecorder === 'undefined') {
        setErrorMessage('このブラウザでは MediaRecorder が利用できません。最新版のブラウザでお試しください。');
        setStatusMessage('録音に対応していないため開始できません。');
        return;
      }

      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
        setAudioUrl(null);
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true }
      });
      mediaStreamRef.current = stream;

      const scriptAtStart = scriptText || defaultScript;
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        setIsRecording(false);
    setIsConverting(true);
    setStatusMessage('録音データを WAV に変換しています...');
    try {
      const webmBlob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
      const wavBlob = await convertBlobToWav(webmBlob);
      const wavUrl = URL.createObjectURL(wavBlob);
      setAudioUrl(wavUrl);
      wavBlobRef.current = wavBlob;
      setRecordedScript(scriptAtStart);
      setStatusMessage('録音が完了しました。再生やダウンロードで確認できます。');
    } catch (error) {
      console.error('WAV 変換に失敗しました', error);
      setErrorMessage('WAV 変換に失敗しました。ブラウザのサポート状況を確認して再試行してください。');
          setStatusMessage('録音データの処理でエラーが発生しました。');
        } finally {
          setIsConverting(false);
          cleanupStream();
        }
      };

      recorder.start();
      setRecordedScript(scriptAtStart);
      setIsRecording(true);
      setStatusMessage('録音中です。入力した文章を落ち着いて読み上げてください。');
    } catch (error) {
      console.error('録音開始に失敗しました', error);
      setStatusMessage('録音を開始できませんでした。');
      setErrorMessage('マイクの権限やデバイスの接続を確認してから再試行してください。');
      cleanupStream();
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      setStatusMessage('録音を停止しています...');
      mediaRecorderRef.current.stop();
    } else {
      cleanupStream();
      setIsRecording(false);
    }
  };

  const handleReset = () => {
    if (isRecording) {
      handleStopRecording();
    }
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setAudioUrl(null);
    wavBlobRef.current = null;
    setRecordedScript(null);
    setStatusMessage('マイクの準備を開始できます。');
    setErrorMessage(null);
  };

  const uploadIfNeeded = async () => {
    const uploadUrl = WAV_UPLOAD_URL;
    if (!uploadUrl || !wavBlobRef.current) return;

    // nextPath から roomId を抜き出し、セッションに保存済みの userId を付与して送る
    const match = nextPath?.match(/\/room\/(.+?)(\?|$)/);
    const roomId = match?.[1];
    const userId = roomId && typeof window !== 'undefined'
      ? sessionStorage.getItem(`steamvc_user_${roomId}`)
      : null;

    const form = new FormData();
    form.append('file', wavBlobRef.current, downloadFileName);
    if (roomId) form.append('roomId', roomId);
    if (userId) form.append('userId', userId);
    if (recordedScript) form.append('script', recordedScript);

    setIsUploading(true);
    setStatusMessage('録音データをサーバーへ送信しています...');
    setErrorMessage(null);

    try {
      const res = await fetch(uploadUrl, {
        method: 'POST',
        body: form,
      });
      if (!res.ok) {
        throw new Error(`Upload failed with status ${res.status}`);
      }
      setStatusMessage('録音データの送信が完了しました。');
    } catch (error) {
      console.error('録音データの送信に失敗しました', error);
      setErrorMessage('録音データの送信に失敗しました。ネットワークとサーバー設定を確認してください。');
    } finally {
      setIsUploading(false);
    }
  };

  const handleProceed = async () => {
    await uploadIfNeeded();
    if (nextPath) {
      router.push(nextPath);
    } else {
      router.push('/');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 text-foreground">
      <div className="max-w-5xl mx-auto px-4 py-10 space-y-6">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => router.push('/')}
            aria-label="戻る"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-amber-700 font-semibold">Voice Capture</p>
            <h1 className="text-3xl font-bold">音声サンプルを録音する</h1>
            <p className="text-sm text-muted-foreground mt-1">
              声質変換用に、指定した文章を読み上げて WAV 形式で保存します。
            </p>
            {nextPath && (
              <p className="text-xs text-amber-800 mt-1">
                録音後に「{nextLabel}」を押すと、次の画面へ進みます。
              </p>
            )}
          </div>
        </div>

        <Card className="border-amber-200 shadow-lg shadow-amber-100">
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2 text-xl">
              <Mic className="h-5 w-5 text-amber-700" />
              録音手順
            </CardTitle>
            <CardDescription>
              静かな環境で、マイクから 15〜20cm 程度の距離を保ち、表示されている文章をそのまま読み上げてください。
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 lg:grid-cols-[1.2fr_1fr] lg:items-start">
            <div className="space-y-3">
              <div className="rounded-lg border border-amber-200 bg-white/70 p-4 shadow-sm space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-amber-700">読み上げる文章</p>
                  <span className="text-[11px] text-muted-foreground">自由に編集できます</span>
                </div>
                <textarea
                  value={scriptText}
                  onChange={(e) => setScriptText(e.target.value)}
                  className="w-full min-h-[8rem] rounded-md border border-amber-200 bg-white px-3 py-2 text-sm leading-relaxed outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
                  placeholder="録音に使う文章を入力してください"
                />
                <p className="text-xs text-muted-foreground">
                  静かな環境で、文章を変更したら保存や録音前に読み上げ内容を確認してください。
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-lg bg-white/80 p-4 border border-amber-200 shadow-sm">
                <p className="text-xs font-semibold text-amber-700 mb-2">録音ステータス</p>
                <p className="text-sm">{statusMessage}</p>
                {errorMessage && (
                  <p className="mt-2 text-sm text-destructive font-medium">
                    {errorMessage}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {!isRecording ? (
                  <Button
                    type="button"
                    onClick={handleStartRecording}
                    disabled={isConverting || isUploading}
                    className="bg-amber-600 hover:bg-amber-700 text-white px-5"
                  >
                    <Mic className="h-4 w-4" />
                    録音を開始
                  </Button>
                ) : (
                  <Button
                    type="button"
                    onClick={handleStopRecording}
                    variant="destructive"
                    className="px-5"
                  >
                    <Square className="h-4 w-4" />
                    録音を停止
                  </Button>
                )}
                <Button
                  type="button"
                  onClick={handleReset}
                  variant="outline"
                  disabled={isRecording || isConverting || isUploading}
                >
                  <RefreshCw className="h-4 w-4" />
                  リセット
                </Button>
              </div>

              {audioUrl && (
                <div className="rounded-lg border border-amber-200 bg-white/90 p-4 shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-amber-900">録音結果</p>
                      {recordedScript && (
                        <p className="text-xs text-muted-foreground mt-1 max-h-12 overflow-y-auto">
                          読み上げた文章: {recordedScript}
                        </p>
                      )}
                    </div>
                    <a
                      href={audioUrl}
                      download={downloadFileName}
                      className="inline-flex items-center gap-2 rounded-md border border-amber-300 bg-amber-100 px-3 py-2 text-sm font-medium text-amber-900 hover:bg-amber-200"
                    >
                      <Download className="h-4 w-4" />
                      WAV を保存
                    </a>
                  </div>
                  <audio controls src={audioUrl} className="w-full" />
                </div>
              )}
              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  onClick={handleProceed}
                  disabled={isRecording || isConverting || isUploading}
                  className="bg-amber-700 hover:bg-amber-800 text-white px-5"
                >
                  <ArrowRight className="h-4 w-4" />
                  {nextLabel}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function VoiceRecorderPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">読み込み中...</div>}>
      <VoiceRecorderContent />
    </Suspense>
  );
}
