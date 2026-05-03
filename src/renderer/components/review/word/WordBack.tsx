import React from 'react'
import ReviewHeader from '../common/ReviewHeader'
import WordEntry from '../../WordEntry'

interface WordBackProps {
  word: {
    id: number
    headword: string
    phon_uk?: string
    phon_us?: string
  }
  onPlayUk?: () => void
  onPlayUs?: () => void
  onNavigate?: () => void
}

export default function WordBack({ word, onPlayUk, onPlayUs, onNavigate }: WordBackProps) {
  return (
    <div className="flex flex-col h-full bg-white relative flex-1">
        <div className="flex-1 overflow-y-auto bg-white relative">
            <div className="pt-8 px-8 pb-0">
                <ReviewHeader 
                    headword={word.headword}
                    phonUk={word.phon_uk}
                    phonUs={word.phon_us}
                    onPlayUk={onPlayUk}
                    onPlayUs={onPlayUs}
                    isBack={true}
                    onClickHeadword={onNavigate}
                />
            </div>

            <WordEntry 
                wordId={word.id} 
                readonly={true} 
                defaultExpandedExamples={1} 
                displayMode="both"
                hideHeader={true}
                className="px-8 pb-8 !h-auto"
                onBack={() => {}} 
            />
        </div>
    </div>
  )
}
