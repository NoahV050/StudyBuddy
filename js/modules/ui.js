export const byId = id => document.getElementById(id);

export function renderEmptyState(element, text) {
  element.replaceChildren();
  const message = document.createElement('div');
  message.className = 'empty-state';
  message.textContent = text;
  element.append(message);
}
