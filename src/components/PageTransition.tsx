import { motion } from "framer-motion"
import { ReactNode } from "react"

const pageVariants = {
  initial: { opacity: 0, y: 15 },
  animate: { 
    opacity: 1, 
    y: 0,
    transition: {
      duration: 0.6,
      ease: [0.16, 1, 0.3, 1]
    }
  },
  exit: { 
    opacity: 0, 
    y: -8,
    transition: { duration: 0.2, ease: "easeIn" }
  }
}

export const PageTransition = ({ children }: { children: ReactNode }) => (
  <motion.div
    variants={pageVariants}
    initial="initial"
    animate="animate"
    exit="exit"
  >
    {children}
  </motion.div>
)

export const FadeUp = ({ 
  children, 
  delay = 0,
  className
}: { 
  children: ReactNode
  delay?: number
  className?: string
}) => (
  <motion.div
    initial={{ opacity: 0, y: 15 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{
      duration: 0.6,
      ease: [0.16, 1, 0.3, 1],
      delay
    }}
    className={className}
  >
    {children}
  </motion.div>
)

export const StaggerContainer = ({ 
  children,
  staggerDelay = 0.08,
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
      hidden: { opacity: 0, y: 15 },
      visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] }
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
    transition={{ type: "spring", stiffness: 400, damping: 17 }}
    onClick={onClick}
    style={style}
    className={className}
    disabled={disabled}
  >
    {children}
  </motion.button>
)
