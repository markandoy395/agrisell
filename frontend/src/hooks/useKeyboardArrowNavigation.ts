import { useEffect, useState } from 'react'
import { SECTION_PERMISSIONS } from '../pages/adminDashboard/adminDashboard.utils.ts'

export const ADMIN_SECTIONS = [
  'Overview',
  'Users',
  'Farmers',
  'Commodities',
  'Categories',
  'Riders',
  'Orders',
  'Deliveries',
  'Safety & SOS',
  'Customer Support',
  'Payments',
  'Sales & Discounts',
  'Reviews',
  'Settings',
] as const

export function getAdjacentAdminSection(
  currentSection: string,
  direction: 'next' | 'prev',
  permissions: string[] = ['admin:manage'],
): string {
  const normalized =
    currentSection === 'Products / Commodities'
      ? 'Commodities'
      : currentSection === 'Logistics Companies'
        ? 'Riders'
        : currentSection === 'Support'
          ? 'Customer Support'
          : currentSection

  const accessibleSections = ADMIN_SECTIONS.filter((sec) => {
    if (permissions.includes('admin:manage')) return true
    const permission = SECTION_PERMISSIONS[sec]
    return !permission || permissions.includes(permission)
  })

  if (accessibleSections.length === 0) return currentSection

  const currentIndex = accessibleSections.indexOf(normalized as (typeof ADMIN_SECTIONS)[number])
  if (currentIndex === -1) {
    return accessibleSections[0]
  }

  if (direction === 'next') {
    const nextIndex = (currentIndex + 1) % accessibleSections.length
    return accessibleSections[nextIndex]
  } else {
    const prevIndex = (currentIndex - 1 + accessibleSections.length) % accessibleSections.length
    return accessibleSections[prevIndex]
  }
}

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"]):not([disabled])',
  '[role="button"]:not([aria-disabled="true"]):not([disabled])',
  '[role="tab"]:not([aria-disabled="true"]):not([disabled])',
  '[role="menuitem"]:not([aria-disabled="true"]):not([disabled])',
  '.nav-item:not([disabled])',
  '.order-filter-tab',
  '.parcel-card',
].join(',')

function isVisible(el: HTMLElement): boolean {
  if (el.offsetWidth <= 0 && el.offsetHeight <= 0) return false
  if (el.hasAttribute('hidden')) return false
  const style = window.getComputedStyle(el)
  return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0'
}

function getVisibleFocusableElements(container: HTMLElement | Document = document): HTMLElement[] {
  const elements = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
  return elements.filter(isVisible)
}

export type KeyboardNavigationOptions = {
  activeNav?: string
  onNavigate?: (section: string) => void
  permissions?: string[]
  showToast?: (message: string) => void
}

export function useKeyboardArrowNavigation(options?: KeyboardNavigationOptions) {
  const [isKeyboardNavActive, setIsKeyboardNavActive] = useState(false)
  const [helperVisible, setHelperVisible] = useState(false)

  useEffect(() => {
    let lastFocusedEl: HTMLElement | null = null

    const setFocusWithStyle = (el: HTMLElement) => {
      if (lastFocusedEl && lastFocusedEl !== el) {
        lastFocusedEl.removeAttribute('data-keyboard-focused')
      }
      el.setAttribute('data-keyboard-focused', 'true')
      el.focus()
      lastFocusedEl = el

      el.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
        behavior: 'smooth',
      })
    }

    const handleFocusOut = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null
      if (target && target.hasAttribute('data-keyboard-focused')) {
        target.removeAttribute('data-keyboard-focused')
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      const arrowKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']
      const isArrowKey = arrowKeys.includes(e.key)

      const activeEl = document.activeElement as HTMLElement | null
      const isInput =
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        (activeEl && activeEl.isContentEditable)

      // Toggle help guide with '?' key when not editing text
      if (e.key === '?' && !isInput && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        setHelperVisible((prev) => !prev)
        return
      }

      // Exit text editing on Escape to resume arrow navigation
      if (e.key === 'Escape' && isInput && activeEl) {
        activeEl.blur()
        setIsKeyboardNavActive(true)
        return
      }

      if (!isArrowKey) {
        // Fast page scroll with PageUp / PageDown / Home / End
        if (!isInput) {
          if (e.key === 'PageDown') {
            e.preventDefault()
            window.scrollBy({ top: window.innerHeight * 0.75, behavior: 'smooth' })
            return
          }
          if (e.key === 'PageUp') {
            e.preventDefault()
            window.scrollBy({ top: -window.innerHeight * 0.75, behavior: 'smooth' })
            return
          }
          if (e.key === 'Home' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            window.scrollTo({ top: 0, behavior: 'smooth' })
            return
          }
          if (e.key === 'End' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
            return
          }
        }
        return
      }

      setIsKeyboardNavActive(true)

      // When inside an input field:
      if (isInput && activeEl instanceof HTMLInputElement) {
        // In input, allow ArrowDown or ArrowUp to escape out of the input and navigate
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          activeEl.blur()
          // Fall through to scroll or navigate down
        } else if (e.key === 'ArrowUp') {
          e.preventDefault()
          activeEl.blur()
          // Fall through to scroll or navigate up
        } else {
          // Allow normal cursor movement within the text field
          return
        }
      } else if (isInput) {
        // Textarea or contenteditable - keep native arrow controls
        return
      }

      // 1. Check if an active modal / dialog is open
      const activeModal = document.querySelector<HTMLElement>(
        '[role="dialog"]:not([hidden]), .modal-backdrop, .dialog-overlay, .admin-dialog, .details-modal, .account-tool-modal',
      )

      if (activeModal && isVisible(activeModal)) {
        const modalElements = getVisibleFocusableElements(activeModal)
        if (modalElements.length > 0) {
          e.preventDefault()
          const currentIndex = modalElements.findIndex((el) => el === activeEl)
          if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
            const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % modalElements.length
            setFocusWithStyle(modalElements[nextIndex])
          } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
            const prevIndex =
              currentIndex <= 0 ? modalElements.length - 1 : currentIndex - 1
            setFocusWithStyle(modalElements[prevIndex])
          }
          return
        }
      }

      // 2. Check if a dropdown menu is open
      const activeMenu = activeEl?.closest<HTMLElement>(
        '.dropdown-menu, .notification-popover, .profile-menu',
      )
      if (activeMenu) {
        const menuItems = getVisibleFocusableElements(activeMenu)
        if (menuItems.length > 0) {
          e.preventDefault()
          const currentIndex = menuItems.findIndex((el) => el === activeEl)
          if (e.key === 'ArrowDown') {
            const nextIndex = (currentIndex + 1) % menuItems.length
            setFocusWithStyle(menuItems[nextIndex])
            return
          }
          if (e.key === 'ArrowUp') {
            const prevIndex = (currentIndex - 1 + menuItems.length) % menuItems.length
            setFocusWithStyle(menuItems[prevIndex])
            return
          }
        }
      }

      // 3. DIRECT SECTION / PAGE SWITCHING WITH ARROW LEFT / ARROW RIGHT
      // Pressing Left or Right arrow directly switches pages/sections (Overview ↔ Orders ↔ Deliveries ↔ etc.)
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        // If focus is in a horizontal tab list (e.g. tabs within a workspace), allow tab navigation if user desires,
        // unless holding Alt/Ctrl or if at tab boundaries or on general page
        const isTab = activeEl?.getAttribute('role') === 'tab' || activeEl?.classList.contains('order-filter-tab')
        const tabList = isTab ? activeEl?.parentElement : null
        const tabs = tabList ? Array.from(tabList.querySelectorAll<HTMLElement>('[role="tab"], .order-filter-tab')).filter(isVisible) : []

        if (isTab && tabs.length > 1 && !e.altKey && !e.ctrlKey) {
          const tabIndex = tabs.findIndex((t) => t === activeEl)
          if (e.key === 'ArrowRight' && tabIndex < tabs.length - 1) {
            e.preventDefault()
            const nextTab = tabs[tabIndex + 1]
            setFocusWithStyle(nextTab)
            nextTab.click()
            return
          }
          if (e.key === 'ArrowLeft' && tabIndex > 0) {
            e.preventDefault()
            const prevTab = tabs[tabIndex - 1]
            setFocusWithStyle(prevTab)
            prevTab.click()
            return
          }
        }

        // Direct Page / Section Switching:
        if (options?.onNavigate && options?.activeNav) {
          e.preventDefault()
          const direction = e.key === 'ArrowRight' ? 'next' : 'prev'
          const nextSection = getAdjacentAdminSection(
            options.activeNav,
            direction,
            options.permissions ?? ['admin:manage'],
          )

          if (nextSection !== options.activeNav) {
            options.onNavigate(nextSection)
            options.showToast?.(`Switched to ${nextSection} (Use ← / → to switch sections)`)
            window.scrollTo({ top: 0, behavior: 'smooth' })
          }
          return
        }
      }

      // 4. VERTICAL SCROLLING AND NAVIGATION WITH ARROW DOWN / ARROW UP
      const mainContent = document.querySelector<HTMLElement>('.main-content') || document.body
      const focusableInWorkspace = getVisibleFocusableElements(mainContent)

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        // If currently focused on an element, try to move down to the next interactive element
        if (activeEl && activeEl !== document.body && mainContent.contains(activeEl)) {
          const currentRect = activeEl.getBoundingClientRect()
          const belowCandidates = focusableInWorkspace.filter((el) => {
            if (el === activeEl) return false
            const r = el.getBoundingClientRect()
            return r.top >= currentRect.bottom - 4
          })

          if (belowCandidates.length > 0) {
            belowCandidates.sort((a, b) => {
              const ra = a.getBoundingClientRect()
              const rb = b.getBoundingClientRect()
              const dyA = ra.top - currentRect.bottom
              const dxA = Math.abs(ra.left + ra.width / 2 - (currentRect.left + currentRect.width / 2))
              const scoreA = dyA * 1.6 + dxA

              const dyB = rb.top - currentRect.bottom
              const dxB = Math.abs(rb.left + rb.width / 2 - (currentRect.left + currentRect.width / 2))
              const scoreB = dyB * 1.6 + dxB
              return scoreA - scoreB
            })
            setFocusWithStyle(belowCandidates[0])
            return
          }
        }

        // Smooth scroll downward
        window.scrollBy({ top: 160, behavior: 'smooth' })
        return
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault()
        // If currently focused on an element, try to move up to the previous interactive element
        if (activeEl && activeEl !== document.body && mainContent.contains(activeEl)) {
          const currentRect = activeEl.getBoundingClientRect()
          const aboveCandidates = focusableInWorkspace.filter((el) => {
            if (el === activeEl) return false
            const r = el.getBoundingClientRect()
            return r.bottom <= currentRect.top + 4
          })

          if (aboveCandidates.length > 0) {
            aboveCandidates.sort((a, b) => {
              const ra = a.getBoundingClientRect()
              const rb = b.getBoundingClientRect()
              const dyA = currentRect.top - ra.bottom
              const dxA = Math.abs(ra.left + ra.width / 2 - (currentRect.left + currentRect.width / 2))
              const scoreA = dyA * 1.6 + dxA

              const dyB = currentRect.top - rb.bottom
              const dxB = Math.abs(rb.left + rb.width / 2 - (currentRect.left + currentRect.width / 2))
              const scoreB = dyB * 1.6 + dxB
              return scoreA - scoreB
            })
            setFocusWithStyle(aboveCandidates[0])
            return
          }
        }

        // Smooth scroll upward
        window.scrollBy({ top: -160, behavior: 'smooth' })
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    document.addEventListener('focusout', handleFocusOut)

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
      document.removeEventListener('focusout', handleFocusOut)
      if (lastFocusedEl) {
        lastFocusedEl.removeAttribute('data-keyboard-focused')
      }
    }
  }, [options?.activeNav, options?.onNavigate, options?.permissions, options?.showToast])

  return {
    isKeyboardNavActive,
    helperVisible,
    setHelperVisible,
  }
}
