import { useEffect, useRef, useState, useCallback } from 'react'
import { useBodyScrollLock } from '../utils/scrollLock'

interface ConfirmDialogProps {
  isOpen: boolean
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  onConfirm: () => void
  onCancel: () => void
  type?: 'info' | 'warning' | 'danger' | 'success'
  alertMode?: boolean  // 单按钮模式（纯通知）
}

export function ConfirmDialog({
  isOpen,
  title = '确认',
  message,
  confirmText = '确认',
  cancelText = '取消',
  onConfirm,
  onCancel,
  type = 'info',
  alertMode = false
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  useBodyScrollLock(isOpen)

  // ESC 关闭
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        alertMode ? onConfirm() : onCancel()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onCancel, onConfirm, alertMode])



  if (!isOpen) return null

  const buttonStyles = {
    info: 'bg-blue-500 hover:bg-blue-600 text-white',
    warning: 'bg-yellow-500 hover:bg-yellow-600 text-white',
    danger: 'bg-red-500 hover:bg-red-600 text-white',
    success: 'bg-green-500 hover:bg-green-600 text-white'
  }

  const iconByType = {
    info: (
      <svg className="w-6 h-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    warning: (
      <svg className="w-6 h-6 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
    danger: (
      <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    success: (
      <svg className="w-6 h-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )
  }

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      style={{ animation: 'fadeIn 0.2s ease-out' }}
    >
      <div 
        ref={dialogRef}
        className="flex max-h-[78vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-2xl mx-4"
        style={{ animation: 'scaleIn 0.2s ease-out' }}
      >
        {/* 标题 */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
          {iconByType[type]}
          <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
        </div>
        
        {/* 内容 */}
        <div className="px-6 py-5 overflow-y-auto">
          <p className="text-gray-600 whitespace-pre-wrap leading-relaxed">{message}</p>
        </div>
        
        {/* 按钮 */}
        <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3">
          {!alertMode && (
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all"
            >
              {cancelText}
            </button>
          )}
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${buttonStyles[type]}`}
          >
            {confirmText}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes scaleIn {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  )
}

// 用于简化调用的 Hook
interface DialogState {
  isOpen: boolean
  title: string
  message: string
  confirmText: string
  cancelText: string
  type: 'info' | 'warning' | 'danger' | 'success'
  alertMode: boolean
  resolve: ((value: boolean) => void) | null
}

export function useConfirmDialog() {
  const [state, setState] = useState<DialogState>({
    isOpen: false,
    title: '确认',
    message: '',
    confirmText: '确认',
    cancelText: '取消',
    type: 'info',
    alertMode: false,
    resolve: null
  })

  const confirm = useCallback((options: {
    title?: string
    message: string
    confirmText?: string
    cancelText?: string
    type?: 'info' | 'warning' | 'danger' | 'success'
  }): Promise<boolean> => {
    return new Promise((resolve) => {
      setState({
        isOpen: true,
        title: options.title || '确认',
        message: options.message,
        confirmText: options.confirmText || '确认',
        cancelText: options.cancelText || '取消',
        type: options.type || 'info',
        alertMode: false,
        resolve
      })
    })
  }, [])

  // 纯通知弹窗（只有确定按钮）
  const alert = useCallback((options: {
    title?: string
    message: string
    confirmText?: string
    type?: 'info' | 'warning' | 'danger' | 'success'
  }): Promise<void> => {
    return new Promise((resolve) => {
      setState({
        isOpen: true,
        title: options.title || '提示',
        message: options.message,
        confirmText: options.confirmText || '好的',
        cancelText: '',
        type: options.type || 'info',
        alertMode: true,
        resolve: () => resolve()
      })
    })
  }, [])

  const handleConfirm = useCallback(() => {
    state.resolve?.(true)
    setState(prev => ({ ...prev, isOpen: false, resolve: null }))
  }, [state.resolve])

  const handleCancel = useCallback(() => {
    state.resolve?.(false)
    setState(prev => ({ ...prev, isOpen: false, resolve: null }))
  }, [state.resolve])

  const DialogComponent = (
    <ConfirmDialog
      isOpen={state.isOpen}
      title={state.title}
      message={state.message}
      confirmText={state.confirmText}
      cancelText={state.cancelText}
      type={state.type}
      alertMode={state.alertMode}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  )

  return { confirm, alert, DialogComponent }
}
