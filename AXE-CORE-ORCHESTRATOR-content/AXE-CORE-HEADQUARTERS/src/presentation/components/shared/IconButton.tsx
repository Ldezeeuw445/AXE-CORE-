import type { ReactNode, ButtonHTMLAttributes, CSSProperties } from 'react';
import { cn } from '@/shared/utils';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  active?: boolean;
}

export function IconButton({
  children,
  active,
  className,
  style,
  type = 'button',
  onClick,
  disabled,
  title,
  ...rest
}: IconButtonProps) {
  const baseStyle: CSSProperties = {
    backgroundColor: active ? '#1A1A2E' : 'transparent',
    color: active ? 'var(--accent-cyan)' : 'var(--text-muted)',
    cursor: disabled ? 'default' : 'pointer',
    ...style,
  };

  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center rounded-lg transition-all duration-fast',
        'w-8 h-8 select-none',
        !disabled && 'hover:scale-105 active:scale-95',
        className
      )}
      style={baseStyle}
      onClick={(e) => {
        e.stopPropagation();
        if (disabled) return;
        onClick?.(e);
      }}
      onMouseEnter={(e) => {
        if (active || disabled) return;
        e.currentTarget.style.backgroundColor = '#1A1A1A';
        e.currentTarget.style.color = 'var(--text-secondary)';
      }}
      onMouseLeave={(e) => {
        if (active || disabled) return;
        e.currentTarget.style.backgroundColor = (style as CSSProperties)?.backgroundColor as string || 'transparent';
        e.currentTarget.style.color = (style as CSSProperties)?.color as string || 'var(--text-muted)';
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
