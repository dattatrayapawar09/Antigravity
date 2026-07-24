import { useState, useRef } from "react";

/**
 * OptionTooltip — reusable hover tooltip wrapper.
 *
 * Props:
 *   content  – JSX to render inside the tooltip bubble
 *   children – the trigger element
 *   position – "top" | "bottom" | "left" | "right"  (default "top")
 *   width    – Tailwind width class, e.g. "w-56" (default "w-60")
 */
export default function OptionTooltip({
  content,
  children,
  position = "top",
  width = "w-60",
}) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef(null);

  const show = () => {
    clearTimeout(timerRef.current);
    setVisible(true);
  };

  const hide = () => {
    timerRef.current = setTimeout(() => setVisible(false), 80);
  };

  // Position classes for the bubble
  const posMap = {
    top:    "bottom-full left-1/2 mb-2 -translate-x-1/2",
    bottom: "top-full left-1/2 mt-2 -translate-x-1/2",
    left:   "right-full top-1/2 mr-2 -translate-y-1/2",
    right:  "left-full top-1/2 ml-2 -translate-y-1/2",
  };
  const posClass = posMap[position] ?? posMap.top;

  return (
    <span
      className="relative inline-block"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}

      {visible && (
        <div
          className={`absolute ${posClass} ${width} z-50 rounded-xl border border-slate-700 bg-slate-900 p-3 text-xs shadow-2xl`}
          onMouseEnter={show}
          onMouseLeave={hide}
        >
          {content}
        </div>
      )}
    </span>
  );
}
