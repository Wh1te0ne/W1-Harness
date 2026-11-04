// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Menu, MenuItemButton } from '../src/Menu.tsx'

afterEach(cleanup)

it('opens component submenus, selects enabled children, and returns left to the parent', () => {
  const selected = vi.fn()
  render(<Menu open anchor={<button>Actions</button>} onClose={vi.fn()}>
    <MenuItemButton onSelect={vi.fn()} onSubmenuSelect={selected}
      submenu={[{ id: 'md', label: 'Markdown' }, { id: 'cwd', label: 'Directory', disabled: true }]}>Copy</MenuItemButton>
  </Menu>)
  const parent = screen.getByRole('menuitem', { name: 'Copy' })
  fireEvent.mouseEnter(parent.parentElement!)
  expect(parent.getAttribute('aria-expanded')).toBe('true')
  fireEvent.click(parent)
  expect(screen.getByRole('menuitem', { name: 'Markdown' })).toBeTruthy()
  const directory = screen.getByRole('menuitem', { name: 'Directory' })
  expect(directory.hasAttribute('disabled')).toBe(true)
  fireEvent.click(directory)
  expect(selected).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('menuitem', { name: 'Markdown' }))
  expect(selected).toHaveBeenCalledWith('md')
  fireEvent.click(parent)
  const child = screen.getByRole('menuitem', { name: 'Markdown' })
  child.focus()
  fireEvent.keyDown(child, { key: 'ArrowLeft' })
  expect(document.activeElement).toBe(parent)
  expect(screen.queryByRole('menuitem', { name: 'Markdown' })).toBeNull()
})
