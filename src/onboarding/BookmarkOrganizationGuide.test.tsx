import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { setLanguagePreference } from '../i18n/languagePreference';
import { BookmarkOrganizationGuide } from './BookmarkOrganizationGuide';

const dialogPrototype = HTMLDialogElement.prototype;
const originalShow = Object.getOwnPropertyDescriptor(dialogPrototype, 'showModal');
const originalClose = Object.getOwnPropertyDescriptor(dialogPrototype, 'close');

beforeEach(async () => {
  await setLanguagePreference('en');
  Object.defineProperties(dialogPrototype, {
    showModal: { configurable: true, value(this: HTMLDialogElement) { this.open = true; } },
    close: { configurable: true, value(this: HTMLDialogElement) { this.open = false; } },
  });
});

afterEach(async () => {
  cleanup();
  if (originalShow) Object.defineProperty(dialogPrototype, 'showModal', originalShow);
  else Reflect.deleteProperty(dialogPrototype, 'showModal');
  if (originalClose) Object.defineProperty(dialogPrototype, 'close', originalClose);
  else Reflect.deleteProperty(dialogPrototype, 'close');
  vi.unstubAllGlobals();
  await setLanguagePreference('auto');
});

it('previews, applies and restores only sample moves without calling browser or AI APIs', () => {
  const move = vi.fn();
  const sendMessage = vi.fn();
  const fetch = vi.fn();
  vi.stubGlobal('chrome', { runtime: { sendMessage }, bookmarks: { move } });
  vi.stubGlobal('fetch', fetch);

  const onOpenOrganizer = vi.fn();
  render(<BookmarkOrganizationGuide onClose={() => {}} onOpenOrganizer={onOpenOrganizer} />);
  fireEvent.click(screen.getByRole('radio', { name: /Advanced folder planning/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Preview sample plan' }));
  expect(screen.getAllByText(/new folder\)/)).toHaveLength(2);
  fireEvent.click(screen.getByRole('checkbox', { name: /Excalidraw/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Apply in practice (1)' }));

  const sampleLocations = () => screen.getByRole('list', { name: 'Sample bookmark locations' });
  expect(within(sampleLocations()).getByText('Development')).toBeInTheDocument();
  expect(within(sampleLocations()).getAllByText('Other bookmarks / Bookmark Atlas')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Restore sample bookmarks' }));
  expect(within(sampleLocations()).getAllByText('Other bookmarks / Bookmark Atlas')).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: 'Open bookmark organizer' }));
  expect(onOpenOrganizer).toHaveBeenCalledOnce();
  expect(move).not.toHaveBeenCalled();
  expect(sendMessage).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});
