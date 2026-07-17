import React from 'react'
import { Volume2 } from 'lucide-react'
import ReviewHeader from '../common/ReviewHeader'
import NoteDisplay from '../common/NoteDisplay'

interface Example {
  en: string
  cn?: string
}

interface SenseReadFrontProps {
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
}

export default function SenseReadFront({
  headword,
  phonUk,
  phonUs,
  definition,
  definitionCn,
  examples = [],
  note,
  displayMode = 'both',
  onPlayUk,
  onPlayUs
}: SenseReadFrontProps) {

  const speakText = async (text: string) => {
      const { audioManager } = await import('../../../utils/audioManager')
      await audioManager.playTts(text, 1)
  }

  return (
    <div className="p-8 flex flex-col h-full flex-1">
        <ReviewHeader 
            headword={headword}
            phonUk={phonUk}
            phonUs={phonUs}
            onPlayUk={() => onPlayUk?.()}
            onPlayUs={() => onPlayUs?.()}
        />

        <div className="flex-1 flex flex-col gap-6">
            {/* Hidden Placeholder for alignment logic if needed, or just let it flow */}
            {/* The original code had an "invisible" definition block to match height? 
                Actually original code put "invisible" definition block in Read Mode? 
                Wait, looking at ReviewFlipCard.tsx:285:
                <div className="text-center invisible">...</div>
                Why invisible?
                Ah, because Read Mode Front SHOULD NOT SHOW DEFINITION?
                Wait! ReviewFlipCard.tsx Line 283: "常规模式界面" (Read Mode).
                Line 285: invisible Definition.
                Line 294: Note + Examples.
                Line 321: "思考释义"
                
                So Front Face Read Mode shows: Headword -> Note -> Examples -> "Think...".
                It DOES NOT show Definition.
            */}
            
            <div className="flex-1 flex flex-col">
                {note && <div className="mb-2"><NoteDisplay text={note} highlight={headword} /></div>}

                {examples.length > 0 ? (
                    <div className="space-y-2">
                    {examples.map((ex, i) => {
                            const hasEnglishExample = ex.en.trim() !== ''
                            const hasChineseExample = typeof ex.cn === 'string' && ex.cn.trim() !== ''

                            return (
                                <div key={i} className="w-full pl-3 border-l-2 border-blue-200 group/ex">
                                    {hasEnglishExample && (
                                        <div className="flex items-start gap-2">
                                            <p className="text-gray-500 text-sm leading-relaxed flex-1" dangerouslySetInnerHTML={{ __html: ex.en }} />
                                            <button
                                                onClick={(e) => { e.stopPropagation(); speakText(ex.en) }}
                                                className="opacity-0 group-hover/ex:opacity-100 transition-opacity p-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-500 flex-shrink-0"
                                                title="朗读例句"
                                            >
                                                <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                                            </button>
                                        </div>
                                    )}
                                    {hasChineseExample && <p className="text-gray-500 text-sm mt-1" dangerouslySetInnerHTML={{ __html: ex.cn }} />}
                                </div>
                            )
                        })}
                    </div>
                ) : null}
            </div>

            <div className="mt-auto pt-8 text-center text-gray-400 text-sm">
                思考释义
            </div>
        </div>
    </div>
  )
}
