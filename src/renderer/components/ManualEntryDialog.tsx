import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CreateCustomEntryExample } from '../../shared/types'
import { ConfirmDialog } from './ConfirmDialog'
import { useBodyScrollLock } from '../utils/scrollLock'

type ManualEntryDialogMode = 'create' | 'edit'

interface ManualEntryDialogInitialData {
  senseId: number
  headword: string
  definitionCn: string
  note?: string
  examples?: CreateCustomEntryExample[]
}

interface ManualEntryDialogProps {
  isOpen: boolean
  mode?: ManualEntryDialogMode
  initialHeadword?: string
  initialData?: ManualEntryDialogInitialData | null
  onClose: () => void
  onCompleted: (wordId: number, headword: string) => void
}

interface ManualEntryExampleInput extends CreateCustomEntryExample {
  id: number
}

interface ErrorDialogState {
  title: string
  message: string
}

const DEFAULT_ERROR_DIALOG_TITLE = '提示'
const SAVE_ERROR_DIALOG_TITLE = '保存失败'
const ERROR_DIALOG_CONFIRM_TEXT = '知道了'

function focusHeadwordInputWithoutPageScroll(input: HTMLInputElement | null): void {
  if (!input) {
    return
  }

  try {
    input.focus({ preventScroll: true })
  } catch {
    input.focus()
  }

  input.setSelectionRange(0, input.value.length)
}

function createEmptyExampleInput(id: number): ManualEntryExampleInput {
  return {
    id,
    en: '',
    cn: ''
  }
}

function buildInitialExampleInputs(examples?: CreateCustomEntryExample[]): ManualEntryExampleInput[] {
  if (!examples || examples.length === 0) {
    return [createEmptyExampleInput(0)]
  }

  return examples.map((example, index) => ({
    id: index,
    en: example.en,
    cn: example.cn
  }))
}

function getReadableErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }

  if (typeof error === 'string' && error.trim() !== '') {
    return error
  }

  return '保存失败'
}

export default function ManualEntryDialog({
  isOpen,
  mode = 'create',
  initialHeadword = '',
  initialData = null,
  onClose,
  onCompleted
}: ManualEntryDialogProps) {
  const [headword, setHeadword] = useState('')
  const [definitionCn, setDefinitionCn] = useState('')
  const [note, setNote] = useState('')
  const [examples, setExamples] = useState<ManualEntryExampleInput[]>([])
  const [errorDialogState, setErrorDialogState] = useState<ErrorDialogState | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const headwordInputRef = useRef<HTMLInputElement | null>(null)
  const nextExampleInputIdRef = useRef(1)
  const isEditMode = mode === 'edit'

  useBodyScrollLock(isOpen)

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const dialogInitialData = isEditMode && initialData
      ? initialData
      : {
          headword: initialHeadword.trim(),
          definitionCn: '',
          note: '',
          examples: []
        }

    setHeadword(dialogInitialData.headword.trim())
    setDefinitionCn(dialogInitialData.definitionCn)
    setNote(dialogInitialData.note || '')
    const initialExampleInputs = buildInitialExampleInputs(dialogInitialData.examples)
    nextExampleInputIdRef.current = initialExampleInputs.length
    setExamples(initialExampleInputs)
    setErrorDialogState(null)
    setIsSaving(false)
  }, [initialData, initialHeadword, isEditMode, isOpen])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const focusTimer = window.setTimeout(() => {
      focusHeadwordInputWithoutPageScroll(headwordInputRef.current)
    }, 0)

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (errorDialogState) {
          setErrorDialogState(null)
          return
        }
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      window.clearTimeout(focusTimer)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [errorDialogState, isOpen, onClose])

  const showErrorDialog = (message: string, title = DEFAULT_ERROR_DIALOG_TITLE) => {
    setErrorDialogState({
      title,
      message
    })
  }

  const handleAddExample = () => {
    const nextExampleInputId = nextExampleInputIdRef.current
    nextExampleInputIdRef.current += 1

    setExamples((currentExamples) => [...currentExamples, createEmptyExampleInput(nextExampleInputId)])
  }

  const handleRemoveExample = (exampleId: number) => {
    setExamples((currentExamples) => currentExamples.filter((example) => example.id !== exampleId))
  }

  const handleExampleChange = (exampleId: number, field: 'en' | 'cn', value: string) => {
    setExamples((currentExamples) =>
      currentExamples.map((example) => (example.id === exampleId ? { ...example, [field]: value } : example))
    )
  }

  const handleSubmit = async () => {
    const normalizedHeadword = headword.trim()
    const normalizedDefinitionCn = definitionCn.trim()
    const normalizedNote = note.trim()
    const normalizedExamples = examples.map((example) => ({
      en: example.en.trim(),
      cn: example.cn.trim()
    }))

    if (!normalizedHeadword) {
      showErrorDialog('请输入英文内容')
      return
    }

    if (!normalizedDefinitionCn) {
      showErrorDialog('请输入中文内容')
      return
    }

    const filledExamples = normalizedExamples.filter((example) => example.en !== '' || example.cn !== '')

    if (isEditMode && !initialData) {
      showErrorDialog('缺少可编辑的卡片数据')
      return
    }

    if (isEditMode && typeof window.api.updateCustomEntry !== 'function') {
      showErrorDialog('当前应用未加载编辑功能，请重启应用后再试', SAVE_ERROR_DIALOG_TITLE)
      return
    }

    setIsSaving(true)
    setErrorDialogState(null)

    try {
      const sharedPayload = {
        headword: normalizedHeadword,
        definitionCn: normalizedDefinitionCn,
        note: normalizedNote || undefined,
        examples: filledExamples.length > 0 ? filledExamples : undefined
      }
      const result = isEditMode
        ? await window.api.updateCustomEntry({
            senseId: initialData?.senseId ?? 0,
            ...sharedPayload
          })
        : await window.api.createCustomEntry(sharedPayload)

      if (!result.success || typeof result.wordId !== 'number') {
        showErrorDialog(result.error || '保存失败', SAVE_ERROR_DIALOG_TITLE)
        return
      }

      onCompleted(result.wordId, normalizedHeadword)
    } catch (error) {
      console.error(isEditMode ? 'Update custom entry failed:' : 'Create custom entry failed:', error)
      showErrorDialog(getReadableErrorMessage(error), SAVE_ERROR_DIALOG_TITLE)
    } finally {
      setIsSaving(false)
    }
  }

  if (!isOpen) {
    return null
  }

  const isSubmitDisabled = isSaving || headword.trim() === '' || definitionCn.trim() === ''
  const dialogTitle = isEditMode ? '编辑手动录入卡片' : '手动录入卡片'
  const dialogDescription = isEditMode
    ? '支持单词、短语和句子；保存后会更新当前自定义卡片。编辑英文原文时，会同步更新当前自定义词条下的其他释义卡片。'
    : '支持单词、短语和句子；保存后会生成新的自定义卡片。相同英文内容重复录入时，会追加到同一条自定义词条下，作为新的释义卡片保存。'
  const submitButtonLabel = isSaving ? '保存中...' : isEditMode ? '保存修改' : '保存为卡片'

  const dialogContent = (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-4" onClick={onClose}>
      <div
        className="flex h-[760px] max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{dialogTitle}</h3>
            <p className="mt-1 text-sm text-gray-500">{dialogDescription}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="space-y-5">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-gray-700">英文原文（必填）</span>
              <input
                ref={headwordInputRef}
                type="text"
                value={headword}
                onChange={(event) => setHeadword(event.target.value)}
                placeholder="可输入单词、短语或句子"
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-gray-700">中文翻译（必填）</span>
              <textarea
                value={definitionCn}
                onChange={(event) => setDefinitionCn(event.target.value)}
                placeholder="输入这条内容对应的中文翻译"
                rows={4}
                className="w-full resize-y rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-gray-700">笔记（选填）</span>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="可选；会作为这条释义卡片的笔记显示"
                rows={3}
                className="w-full resize-y rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
            </label>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="block text-sm font-medium text-gray-700">例句（选填）</span>
              </div>

              <div className="space-y-3">
                {examples.map((example, index) => (
                  <div key={example.id} className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-600">第 {index + 1} 句</span>
                      {examples.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveExample(example.id)}
                          disabled={isSaving}
                          className="rounded-lg px-2 py-1 text-sm font-medium text-gray-500 transition hover:bg-white hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          删除
                        </button>
                      )}
                    </div>

                    <div className="space-y-3">
                      <label className="block">
                        <span className="mb-2 block text-xs font-medium text-gray-500">英文句子</span>
                        <textarea
                          value={example.en}
                          onChange={(event) => handleExampleChange(example.id, 'en', event.target.value)}
                          placeholder="输入这句英文例句"
                          rows={2}
                          className="w-full resize-y rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-2 block text-xs font-medium text-gray-500">中文翻译</span>
                        <textarea
                          value={example.cn}
                          onChange={(event) => handleExampleChange(example.id, 'cn', event.target.value)}
                          placeholder="输入这句例句对应的中文翻译"
                          rows={2}
                          className="w-full resize-y rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                        />
                      </label>
                    </div>
                  </div>
                ))}

                <div className="flex justify-start">
                  <button
                    type="button"
                    onClick={handleAddExample}
                    disabled={isSaving}
                    aria-label="添加一句"
                    className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${
                      isSaving
                        ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-300'
                        : 'border-blue-100 bg-blue-50 text-blue-600 hover:bg-blue-100'
                    }`}
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14m-7-7h14" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-gray-100 bg-gray-50 px-6 py-4">
          <button
            onClick={onClose}
            disabled={isSaving}
            className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitDisabled}
            className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitButtonLabel}
          </button>
        </div>
      </div>

      <div onClick={(event) => event.stopPropagation()}>
        <ConfirmDialog
          isOpen={Boolean(errorDialogState)}
          title={errorDialogState?.title || DEFAULT_ERROR_DIALOG_TITLE}
          message={errorDialogState?.message || ''}
          confirmText={ERROR_DIALOG_CONFIRM_TEXT}
          type="warning"
          alertMode
          onConfirm={() => setErrorDialogState(null)}
          onCancel={() => setErrorDialogState(null)}
        />
      </div>
    </div>
  )

  if (typeof document === 'undefined') {
    return dialogContent
  }

  return createPortal(dialogContent, document.body)
}
