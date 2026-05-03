
import { useState, useRef, useEffect } from 'react'

interface WordSpeakFrontProps {
  headword: string
  senses: {
    definition?: string
    definition_cn?: string
  }[]
  onRecordingComplete: (url: string) => void
}

export default function WordSpeakFront({ headword, senses, onRecordingComplete }: WordSpeakFrontProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [hasRecorded, setHasRecorded] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
        }
      }

      mediaRecorder.onstop = () => {
        setHasRecorded(true)
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        const url = URL.createObjectURL(blob)
        onRecordingComplete(url)
        // Auto-stop tracks
        stream.getTracks().forEach(track => track.stop())
      }

      mediaRecorder.start()
      setIsRecording(true)
    } catch (err) {
      console.error('Failed to start recording:', err)
      alert('无法访问麦克风，请检查权限设置')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }

  const handleToggleRecord = () => {
    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isRecording) {
         stopRecording()
      }
    }
  }, [isRecording])

  return (
    <div className="flex flex-col h-full items-center p-8">
      {/* Headword */}
      <div className="flex-1 flex flex-col items-center justify-center w-full gap-8">
        <h2 className="text-4xl font-bold text-gray-800">{headword}</h2>
        
        {/* Definitions */}
        <div className="w-full max-w-lg space-y-4">
            {senses.map((sense, idx) => (
                <div key={idx} className="bg-gray-50 p-4 rounded-lg border border-gray-100">
                    {sense.definition && <div className="text-lg font-medium text-gray-700">{sense.definition}</div>}
                    {sense.definition_cn && <div className="text-gray-500 mt-1">{sense.definition_cn}</div>}
                </div>
            ))}
        </div>
      </div>

      {/* Recording Control */}
      <div className="flex-shrink-0 mt-8 mb-4 flex flex-col items-center">
        <button
          onClick={handleToggleRecord}
          className={`flex flex-col items-center justify-center w-24 h-24 rounded-full transition-all shadow-lg ${
            isRecording 
              ? 'bg-red-500 hover:bg-red-600 scale-110 shadow-red-200' 
              : 'bg-blue-500 hover:bg-blue-600 shadow-blue-200'
          }`}
          title={isRecording ? "停止录音" : "开始录音"}
        >
          {isRecording ? (
             <div className="w-8 h-8 bg-white rounded-md animate-pulse" />
          ) : (
             <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
             </svg>
          )}
        </button>
        <div className="mt-4 text-gray-500 text-sm font-medium">
             {isRecording ? "正在录音... (点击结束)" : hasRecorded ? "点击重新录制" : "点击录音"}
        </div>
      </div>

      <div className="mt-auto pt-4 text-center text-gray-400 text-sm">
        朗读原文
      </div>
    </div>
  )
}
