import React from 'react'

interface NoteDisplayProps {
  text: string
  highlight: string
}

export default function NoteDisplay({ text, highlight }: NoteDisplayProps) {
  if (!text) return null
  return (
    <div className="text-sm group relative text-gray-600 pl-3 py-1 pr-6 border-l-2 border-yellow-400 bg-yellow-50/50">
       <p className="whitespace-pre-wrap">
          {(() => {
            try {
              const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
              const regex = new RegExp(`(${escapeRegExp(highlight)})`, 'gi')
              return text.split(regex).map((part, i) => 
                (i % 2 === 1) ? <span key={i} className="font-bold text-yellow-600">{part}</span> : part
              )
            } catch (e) {
              return text
            }
          })()}
       </p>
    </div>
  )
}
