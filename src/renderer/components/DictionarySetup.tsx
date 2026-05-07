import { useState, useEffect } from 'react'
import { DictionaryImportProgress, DictionaryParserType } from '../../shared/types'
import { captureTelemetryEvent } from '../telemetry'

interface DictionarySetupProps {
  onComplete: () => void
}

const OXFORD_DICTIONARY_DOWNLOAD_URL =
  'https://drive.google.com/file/d/1R9DM3QP9mBaLhnQ2bCrCUp_UJdLgp90l/view?usp=sharing'

export default function DictionarySetup({ onComplete }: DictionarySetupProps) {
  const [mdxPath, setMdxPath] = useState<string | null>(null)
  const [mddPaths, setMddPaths] = useState<string[]>([])
  const [parserType] = useState<DictionaryParserType>('default')
  const [isImporting, setIsImporting] = useState(false)
  const [progress, setProgress] = useState<DictionaryImportProgress | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Listen for progress updates
  useEffect(() => {
    const unsubscribe = window.api.onDictionaryImportProgress((p) => {
      setProgress(p)
      if (p.stage === 'done') {
        captureTelemetryEvent('dictionary_import_finished', {
          success: true,
          stage: p.stage
        })
        setTimeout(() => {
          onComplete()
        }, 1000)
      } else if (p.stage === 'error') {
        captureTelemetryEvent('dictionary_import_finished', {
          success: false,
          stage: p.stage
        })
        setError(p.message)
        setIsImporting(false)
      }
    })
    return unsubscribe
  }, [onComplete])

  const handleSelectMdx = async () => {
    const result = await window.api.selectDictionaryFile('mdx')
    if (result.success && result.filePaths && result.filePaths.length > 0) {
      setMdxPath(result.filePaths[0])
      setError(null)
    }
  }

  const handleSelectMdd = async () => {
    const result = await window.api.selectDictionaryFile('mdd')
    if (result.success && result.filePaths) {
      setMddPaths(result.filePaths)
    }
  }

  const handleImport = async () => {
    if (!mdxPath) {
      setError('请先选择 MDX 词典文件')
      return
    }

    setIsImporting(true)
    setError(null)
    setProgress({ stage: 'copying', current: 0, total: 1, message: '准备导入...' })
    captureTelemetryEvent('dictionary_import_started', {
      parser_type: parserType,
      mdd_file_count: mddPaths.length,
      has_mdd: mddPaths.length > 0
    })

    const result = await window.api.importDictionary(mdxPath, mddPaths, parserType)
    
    if (!result.success) {
      captureTelemetryEvent('dictionary_import_finished', {
        success: false,
        stage: 'import_result'
      })
      setError(result.error || '导入失败')
      setIsImporting(false)
    }
  }

  const getFileName = (path: string) => {
    return path.split('/').pop() || path
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-8">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">导入词典</h1>
          <p className="text-gray-500 text-sm">
            请选择你的 MDX 词典文件开始使用
          </p>
          <p className="mt-3 text-xs leading-5 text-gray-500">
            为规避版权问题，请自行下载下面的牛津双解词典文件后导入，且目前应用只支持此 MDX
            词典文件，暂不支持别的 MDX 词典文件：
            <a
              href={OXFORD_DICTIONARY_DOWNLOAD_URL}
              target="_blank"
              rel="noreferrer"
              className="block mt-1 font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700"
            >
              下载牛津双解词典文件
            </a>
          </p>
        </div>

        {/* Progress */}
        {isImporting && progress && (
          <div className="mb-6">
            <div className="flex justify-between text-sm text-gray-600 mb-2">
              <span>{progress.message}</span>
              {progress.total > 0 && (
                <span>{Math.round((progress.current / progress.total) * 100)}%</span>
              )}
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
            {error}
          </div>
        )}

        {/* File Selection */}
        {!isImporting && (
          <div className="space-y-4">
            {/* MDX Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                MDX 词典文件 <span className="text-red-500">*</span>
              </label>
              <button
                onClick={handleSelectMdx}
                className="w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors flex items-center justify-center gap-2 text-gray-600"
              >
                {mdxPath ? (
                  <>
                    <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-gray-800 truncate">{getFileName(mdxPath)}</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    <span>选择 MDX 文件</span>
                  </>
                )}
              </button>
            </div>

            {/* MDD Selection (Optional) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                MDD 音频文件 <span className="text-gray-400">(可选)</span>
              </label>
              <button
                onClick={handleSelectMdd}
                className="w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors flex items-center justify-center gap-2 text-gray-600"
              >
                {mddPaths.length > 0 ? (
                  <>
                    <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-gray-800">{mddPaths.length} 个文件已选择</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    <span>选择 MDD 文件（多选，共 4 个）</span>
                  </>
                )}
              </button>
            </div>



            {/* Import Button */}
            <button
              onClick={handleImport}
              disabled={!mdxPath}
              className={`w-full py-3 rounded-lg font-medium transition-colors ${
                mdxPath
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              开始导入
            </button>
          </div>
        )}

        {/* Help Text */}
        <div className="mt-6 pt-6 border-t border-gray-200">
          <p className="text-xs text-gray-400 text-center">
            提示：MDX 文件是必需的词典数据，MDD 文件包含发音音频。
            <br />
            导入过程可能需要几分钟，请耐心等待。
          </p>
        </div>
      </div>
    </div>
  )
}
