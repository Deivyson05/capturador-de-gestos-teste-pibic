'use client';

import { useEffect, useState, useRef } from 'react';
import {
  GestureRecognizer,
  FilesetResolver,
  DrawingUtils,
} from '@mediapipe/tasks-vision';

import { Button } from '@/components/ui/button';

// Definindo os tipos para o stream de vídeo e outras variáveis
type MediaStreamType = MediaStream | null;

export default function Leitor() {
  const [webcamRunning, setWebcamRunning] = useState<boolean>(false);
  const [webcamButtonInfo, setWebcamButtonInfo] = useState<string>('ENABLE PREDICTIONS');
  const [hasWebcamSupport, setHasWebcamSupport] = useState<boolean | null>(null);
  const [isVideoReady, setIsVideoReady] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasElement = useRef<HTMLCanvasElement | null>(null);
  const gestureOutput = useRef<HTMLDivElement | null>(null);
  const [videoStream, setVideoStream] = useState<MediaStreamType>(null);
  const gestureRecognizerRef = useRef<GestureRecognizer | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Verificar suporte da webcam apenas no cliente
  useEffect(() => {
    const checkWebcamSupport = () => {
      return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    };
    setHasWebcamSupport(checkWebcamSupport());
  }, []);

  // Função para iniciar ou parar a webcam
  const enableCam = () => {
    if (webcamRunning) {
      setWebcamRunning(false);
      setWebcamButtonInfo('ENABLE PREDICTIONS');
      stopWebcam();
    } else {
      setWebcamRunning(true);
      setWebcamButtonInfo('DISABLE PREDICTIONS');
      startWebcam();
    }
  };

  // Função para iniciar a webcam
  const startWebcam = () => {
    const constraints: MediaStreamConstraints = {
      video: { 
        width: { ideal: 640 },
        height: { ideal: 360 },
        facingMode: 'user' 
      },
    };

    navigator.mediaDevices
      .getUserMedia(constraints)
      .then((stream) => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          // Aguardar o vídeo estar pronto
          videoRef.current.onloadedmetadata = () => {
            setIsVideoReady(true);
          };
        }
        setVideoStream(stream);
      })
      .catch((error) => {
        console.error('Erro ao acessar a webcam: ', error);
        setWebcamRunning(false);
        setWebcamButtonInfo('ENABLE PREDICTIONS');
      });
  };

  // Função para parar a webcam
  const stopWebcam = () => {
    // Cancelar animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (videoStream) {
      const tracks = videoStream.getTracks();
      tracks.forEach((track) => track.stop());
      setVideoStream(null);
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    }
    setIsVideoReady(false);
  };

  // Função para configurar e carregar o GestureRecognizer do MediaPipe
  const createGestureRecognizer = async () => {
    try {
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm'
      );
      const recognizer = await GestureRecognizer.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
      });
      gestureRecognizerRef.current = recognizer;
    } catch (error) {
      console.error('Erro ao criar gesture recognizer:', error);
    }
  };

  // Função para detectar os gestos da webcam
  const predictWebcam = async () => {
    const webcamElement = videoRef.current;
    const gestureRecognizer = gestureRecognizerRef.current;

    if (!webcamElement || !gestureRecognizer || !webcamRunning || !isVideoReady) {
      return;
    }

    try {
      // Verificar se o vídeo está pronto para ser processado
      if (webcamElement.readyState !== webcamElement.HAVE_ENOUGH_DATA) {
        // Se o vídeo não está pronto, tentar novamente no próximo frame
        if (webcamRunning) {
          animationFrameRef.current = window.requestAnimationFrame(predictWebcam);
        }
        return;
      }

      const nowInMs = Date.now();
      const results = await gestureRecognizer.recognizeForVideo(
        webcamElement,
        nowInMs
      );

      const canvasCtx = canvasElement.current?.getContext('2d');

      if (canvasCtx && canvasElement.current) {
        canvasCtx.save();
        canvasCtx.clearRect(0, 0, canvasElement.current.width, canvasElement.current.height);

        const drawingUtils = new DrawingUtils(canvasCtx);

        // Desenha os landmarks das mãos detectadas
        if (results.landmarks) {
          for (const landmarks of results.landmarks) {
            drawingUtils.drawConnectors(landmarks, GestureRecognizer.HAND_CONNECTIONS, {
              color: '#00FF00',
              lineWidth: 5,
            });
            drawingUtils.drawLandmarks(landmarks, {
              color: '#FF0000',
              lineWidth: 2,
            });
          }
        }

        // Exibe a detecção do gesto
        if (results.gestures && results.gestures.length > 0 && gestureOutput.current) {
          gestureOutput.current.style.display = 'block';
          const categoryName = results.gestures[0][0].categoryName;
          const categoryScore = parseFloat(results.gestures[0][0].score * 100).toFixed(2);
          const handedness = results.handednesses?.[0]?.[0]?.displayName || 'Unknown';

          gestureOutput.current.innerText = `GestureRecognizer: ${categoryName}\n Confidence: ${categoryScore}%\n Handedness: ${handedness}`;
        } else if (gestureOutput.current) {
          gestureOutput.current.style.display = 'none';
        }

        canvasCtx.restore();
      }

      // Continuar a animação apenas se a webcam ainda estiver ativa
      if (webcamRunning) {
        animationFrameRef.current = window.requestAnimationFrame(predictWebcam);
      }
    } catch (error) {
      console.error('Erro durante a predição:', error);
      // Continuar a animação mesmo em caso de erro
      if (webcamRunning) {
        animationFrameRef.current = window.requestAnimationFrame(predictWebcam);
      }
    }
  };

  // Efeito para criar o GestureRecognizer
  useEffect(() => {
    createGestureRecognizer();

    // Limpeza quando o componente for desmontado
    return () => {
      stopWebcam();
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Efeito para iniciar predições quando o vídeo estiver pronto
  useEffect(() => {
    if (webcamRunning && isVideoReady && gestureRecognizerRef.current) {
      predictWebcam();
    }
  }, [webcamRunning, isVideoReady]);

  // Handler para quando o vídeo é carregado
  const handleVideoLoad = () => {
    setIsVideoReady(true);
  };

  return (
    <main className="flex flex-col h-screen">
      <div id="liveView" className="videoView">
        <Button
          id="webcamButton"
          className={`cursor-pointer ${hasWebcamSupport === false ? 'object-none' : ''}`}
          onClick={enableCam}
          disabled={hasWebcamSupport === false}
        >
          <span className="mdc-button__ripple"></span>
          <span className="mdc-button__label">{webcamButtonInfo}</span>
        </Button>
        <div className="relative w-full">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted // Adicionado muted para melhor compatibilidade
            width="640"
            height="380"
            onLoadedData={handleVideoLoad}
            style={{ 
              display: 'block',
              transform: 'scaleX(-1)', // Espelhar o vídeo para parecer mais natural
              objectFit: 'cover'
            }}
          />
          <canvas
            ref={canvasElement}
            width="840"
            height="660"
            style={{ 
              width: '100%',
              height: '100%',
              position: 'absolute', 
              top: 0, 
              left: 0,
              transform: 'scaleX(-1)' // Espelhar o canvas também para corresponder ao vídeo
            }}
          />
        </div>
        <div 
          id="gesture_output" 
          ref={gestureOutput} 
          style={{ 
            display: 'none',
            background: 'rgba(0,0,0,0.7)',
            color: 'white',
            padding: '10px',
            borderRadius: '5px',
            zIndex: 10
          }}
          className="object-none absolute bottom-10 left-10"
        />
      </div>
      <div style={{ marginTop: '10px' }}>
        {hasWebcamSupport === null 
          ? 'Verificando suporte da webcam...'
          : hasWebcamSupport
          ? webcamRunning 
            ? 'Webcam ativa. Mostre suas mãos para detecção de gestos.'
            : 'A webcam está funcionando corretamente. Clique no botão para iniciar.'
          : 'Seu aparelho não tem webcam ou não suporta essa funcionalidade.'}
      </div>
      {webcamRunning && !isVideoReady && (
        <div style={{ marginTop: '10px', color: 'orange' }}>
          Inicializando webcam...
        </div>
      )}
    </main>
  );
}