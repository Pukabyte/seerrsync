import React, { useEffect, useState, useRef } from 'react'

function AnimatedNumber({ value, className = '', duration = 600, style }) {
  const normalizedValue = value ?? 0
  const [displayValue, setDisplayValue] = useState(normalizedValue)
  const [isAnimating, setIsAnimating] = useState(false)
  const prevValueRef = useRef(normalizedValue)

  useEffect(() => {
    const currentValue = value ?? 0
    if (prevValueRef.current !== currentValue) {
      setIsAnimating(true)
      const timeout = setTimeout(() => {
        setDisplayValue(currentValue)
        setIsAnimating(false)
        prevValueRef.current = currentValue
      }, duration / 2)
      return () => clearTimeout(timeout)
    } else {
      setDisplayValue(currentValue)
    }
  }, [value, duration])

  // Extract gradient-related styles to apply to inner span
  const innerStyle = style && (style.background || style.WebkitBackgroundClip) 
    ? {
        background: style.background,
        WebkitBackgroundClip: style.WebkitBackgroundClip,
        WebkitTextFillColor: style.WebkitTextFillColor,
        backgroundClip: style.backgroundClip
      }
    : {}

  const outerStyle = style ? Object.fromEntries(
    Object.entries(style).filter(([key]) => 
      !['background', 'WebkitBackgroundClip', 'WebkitTextFillColor', 'backgroundClip'].includes(key)
    )
  ) : {}

  return (
    <span 
      className={`animated-number ${isAnimating ? 'flipping' : ''} ${className}`}
      style={outerStyle}
    >
      <span className="animated-number-inner" style={innerStyle}>{displayValue}</span>
    </span>
  )
}

export default AnimatedNumber

