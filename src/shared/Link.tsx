import type { AnchorHTMLAttributes, MouseEvent } from 'react'
import { navigate, routeHref } from './router.ts'

type LinkProps = { to: string } & AnchorHTMLAttributes<HTMLAnchorElement>

/** A real link (it can be opened in a new tab) that navigates without reloading. */
export function Link({ to, onClick, ...props }: LinkProps) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event)
    const modified = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
    if (event.defaultPrevented || event.button !== 0 || modified || props.target) return
    event.preventDefault()
    navigate(to)
  }
  return <a href={routeHref(to)} onClick={handleClick} {...props} />
}
