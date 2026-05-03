import React from 'react'
import ReviewHeader from '../common/ReviewHeader'
import NoteDisplay from '../common/NoteDisplay'

interface Example {
  en: string
  cn?: string
}

interface SenseBackProps {
  headword: string
  phonUk?: string
  phonUs?: string
  definition: string
  definitionCn?: string
  examples?: Example[]
  note?: string
  displayMode?: 'en' | 'cn' | 'both'
  onPlayUk?: (rate?: number) => void
  onPlayUs?: (rate?: number) => void
  onNavigate?: () => void
}

export default function SenseBack({
  headword,
  phonUk,
  phonUs,
  definition,
  definitionCn,
  examples = [],
  note,
  displayMode = 'both',
  onPlayUk,
  onPlayUs,
  onNavigate
}: SenseBackProps) {
  return (
    <div className="p-8 flex flex-col h-full flex-1">
        <ReviewHeader 
            headword={headword}
            phonUk={phonUk}
            phonUs={phonUs}
            onPlayUk={() => onPlayUk?.()}
            onPlayUs={() => onPlayUs?.()}
            isBack={true}
            onClickHeadword={onNavigate}
        />

        <div className="flex-1 flex flex-col gap-6">
            {/* Definition */}
            <div className="text-center">
                {(displayMode === 'en' || displayMode === 'both') && (
                    <p className="text-xl font-bold text-gray-900 leading-relaxed mb-2">{definition}</p>
                )}
                {(displayMode === 'cn' || displayMode === 'both') && definitionCn && (
                    <p className="text-lg font-bold text-gray-700">{definitionCn}</p>
                )}
            </div>

            {/* Note & Examples */}
            <div>
                {note && <div className="mb-2"><NoteDisplay text={note} highlight={headword} /></div>}

                <div className="space-y-2">
                    {examples.map((ex, i) => {
                        const hasEnglishExample = ex.en.trim() !== ''
                        const hasChineseExample = typeof ex.cn === 'string' && ex.cn.trim() !== ''

                        return (
                            <div key={i} className="pl-3 border-l-2 border-blue-200 group/ex">
                                {hasEnglishExample && (
                                    <div className="flex items-start gap-2">
                                        <p className="text-gray-500 text-sm leading-relaxed flex-1" dangerouslySetInnerHTML={{ __html: ex.en }} />
                                    </div>
                                )}
                                {hasChineseExample && <p className="text-gray-500 text-sm mt-1" dangerouslySetInnerHTML={{ __html: ex.cn }} />}
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    </div>
  )
}
