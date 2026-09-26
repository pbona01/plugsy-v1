import { motion, useReducedMotion } from "motion/react"
import { ReactNode } from "react"

const MOTION_EASE = [0.22, 1, 0.36, 1] as const

export const PageTransition = ({ children }: { children: ReactNode }) => {
  const reduceMotion = useReducedMotion()
  return (
    <motion.div
      initial={{ opacity: 0, y: reduceMotion ? 0 : 6, scale: reduceMotion ? 1 : 0.998 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: reduceMotion ? 0 : -2 }}
      transition={{ duration: reduceMotion ? 0.01 : 0.22, ease: MOTION_EASE }}
    >
      {children}
    </motion.div>
  )
}

export const FadeUp = ({ 
  children, 
  delay = 0,
  className
}: { 
  children: ReactNode
  delay?: number
  className?: string
}) => {
  const reduceMotion = useReducedMotion()
  return (
    <motion.div
      initial={{ opacity: 0, y: reduceMotion ? 0 : 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: reduceMotion ? 0.01 : 0.22,
        ease: MOTION_EASE,
        delay: reduceMotion ? 0 : delay
      }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

export const StaggerContainer = ({ 
  children,
  staggerDelay = 0.045,
  className
}: { 
  children: ReactNode
  staggerDelay?: number
  className?: string
}) => (
  <motion.div
    initial="hidden"
    animate="visible"
    className={className}
    variants={{
      hidden: {},
      visible: {
        transition: {
          staggerChildren: staggerDelay
        }
      }
    }}
  >
    {children}
  </motion.div>
)

export const StaggerItem = ({ children, className }: { children: ReactNode, className?: string, key?: any }) => (
  <motion.div
    className={className}
    variants={{
      hidden: { opacity: 0, y: 6 },
      visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.22, ease: MOTION_EASE }
      }
    }}
  >
    {children}
  </motion.div>
)

export const ScaleButton = ({ 
  children,
  onClick,
  style,
  disabled,
  className,
  type = "button"
}: any) => (
  <motion.button
    type={type}
    whileTap={{ scale: disabled ? 1 : 0.97 }}
    whileHover={{ scale: disabled ? 1 : 1.01 }}
    transition={{ duration: 0.12, ease: MOTION_EASE }}
    onClick={onClick}
    style={style}
    className={className}
    disabled={disabled}
  >
    {children}
  </motion.button>
)
