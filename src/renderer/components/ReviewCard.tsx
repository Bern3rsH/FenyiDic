import { useState } from 'react'

interface ReviewCardProps {
  headword: string
  phonUk?: string
  phonUs?: string
  definition: string
  definitionCn?: string
}

export default function ReviewCard({
  headword,
  phonUk,
  phonUs,
  definition,
  definitionCn
}: ReviewCardProps) {
  const [flipped, setFlipped] = useState(false)

  const handleFlip = () => {
    setFlipped(!flipped)
  }

  return (
    <div 
      className="w-80 h-48 cursor-pointer perspective-1000"
      onClick={handleFlip}
    >
      <div 
        className={`relative w-full h-full transition-transform duration-500 transform-style-3d ${flipped ? 'rotate-y-180' : ''}`}
      >
        {/* 正面 - 单词 */}
        <div className="absolute inset-0 backface-hidden bg-white rounded-2xl shadow-lg p-6 flex flex-col items-center justify-center">
          <div className="text-3xl font-bold text-gray-800 mb-2">
            {headword}
          </div>
          {(phonUk || phonUs) && (
            <div className="text-sm text-gray-400">
              {phonUk && <span>UK {phonUk}</span>}
              {phonUk && phonUs && <span className="mx-2">·</span>}
              {phonUs && <span>US {phonUs}</span>}
            </div>
          )}
          <div className="mt-4 text-sm text-gray-400">
            点击翻转查看释义
          </div>
        </div>

        {/* 背面 - 释义 */}
        <div className="absolute inset-0 backface-hidden bg-white rounded-2xl shadow-lg p-6 flex flex-col items-center justify-center rotate-y-180">
          <div className="text-xl font-medium text-gray-800 mb-2 text-center">
            {definitionCn || definition}
          </div>
          {definitionCn && (
            <div className="text-sm text-gray-500 text-center">
              {definition}
            </div>
          )}
          <div className="mt-4 text-sm text-gray-400">
            点击翻转查看原文
          </div>
        </div>
      </div>
    </div>
  )
}
