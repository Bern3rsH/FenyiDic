/**
 * Spell checking utility for review mode
 * Compares user input with the correct answer letter by letter
 */

export interface LetterResult {
  char: string
  correct: boolean
  type: 'match' | 'wrong' | 'missing' | 'extra'
}

export interface SpellResult {
  isCorrect: boolean
  letters: LetterResult[]
  userInput: string
  answer: string
}

/**
 * Check spelling by comparing user input with the correct answer
 * Case-insensitive comparison
 */
export function checkSpelling(userInput: string, answer: string): SpellResult {
  const normalizedInput = userInput.trim().toLowerCase()
  const normalizedAnswer = answer.trim().toLowerCase()
  
  const isCorrect = normalizedInput === normalizedAnswer
  const letters: LetterResult[] = []
  
  const maxLen = Math.max(normalizedInput.length, normalizedAnswer.length)
  
  for (let i = 0; i < maxLen; i++) {
    const inputChar = normalizedInput[i]
    const answerChar = normalizedAnswer[i]
    
    if (inputChar === undefined) {
      // Missing letter
      letters.push({
        char: answerChar,
        correct: false,
        type: 'missing'
      })
    } else if (answerChar === undefined) {
      // Extra letter
      letters.push({
        char: inputChar,
        correct: false,
        type: 'extra'
      })
    } else if (inputChar === answerChar) {
      // Correct letter
      letters.push({
        char: inputChar,
        correct: true,
        type: 'match'
      })
    } else {
      // Wrong letter
      letters.push({
        char: inputChar,
        correct: false,
        type: 'wrong'
      })
    }
  }
  
  return {
    isCorrect,
    letters,
    userInput: normalizedInput,
    answer: normalizedAnswer
  }
}
