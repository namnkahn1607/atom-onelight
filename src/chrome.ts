import { palette } from "./palette";

export const alpha = (hex: string, byte: number) => hex + byte.toString(16).padStart(2, '0');

export const chrome = {
    bg: palette.bg,  // editor, side bar, activity bar, active tab
    surface: '#e6e9ef',  // panel, status bar, title bar, inactive tab, widget
    border: '#dbdbdc',
    ink: '#121417',  // chrome text
    text: palette.fg,
    accent: '#1a85ff',  // focus, button, badge, cursor, find
    accentHover: '#1975ff',
    selection: '#e6e8ec',
    lineNumber: '#9d9d9f',
    hint: '#afb2bb',  // inlay hints
} as const;

export const status = {
    added: '#40a02b',  // added + untracked
    modified: '#1e66f5',
    renamed: palette.yellow,  // the only value the same as palette (which shouldn't)
    conflict: '#d4264b',  // conflict + staged-deleted
    staged: '#8839ef',  // staged-modified
    faded: '#acb0be',  // delete + submodule
    ignored: '#8e8e90',
} as const;

export function workbenchColors(): Record<string, string> {
    const { bg, surface, border, ink, text, accent, accentHover, selection, lineNumber, hint } = chrome;
    return {
        'activityBar.background': bg,
        'activityBar.foreground': ink,
        'activityBarBadge.background': accent,
        'activityBarBadge.foreground': surface,

        'badge.background': accent,
        'badge.foreground': bg,

        'button.background': accent,
        'button.foreground': bg,
        'button.hoverBackground': accentHover,

        'dropdown.background': surface,
        'dropdown.border': border,

        'editor.findMatchBackground': alpha(accent, 0x66),
        'editor.findMatchHighlightBackground': alpha(accent, 0x33),
        'editor.lineHighlightBackground': alpha(text, 0x0c),
        'editor.selectionBackground': selection,
        'editor.wordHighlightTextBackground': alpha(accent, 0x33),
        'editorCursor.foreground': accent,
        'editorGroup.border': border,
        'editorGroupHeader.tabsBackground': surface,
        'editorHoverWidget.background': surface,
        'editorHoverWidget.border': border,
        'editorIndentGuide.activeBackground1': alpha(text, 0xcf),
        'editorIndentGuide.background1': alpha(text, 0x33),
        'editorInlayHint.background': bg,
        'editorInlayHint.foreground': hint,
        'editorLineNumber.foreground': lineNumber,
        'editorLineNumber.activeForeground': text,
        'editorRuler.foreground': alpha(text, 0x33),
        'editorSuggestWidget.background': surface,
        'editorSuggestWidget.border': border,
        'editorSuggestWidget.selectedBackground': border,
        'editorWhitespace.foreground': alpha(text, 0x33),
        'editorWidget.background': surface,

        'extensionButton.prominentBackground': accent,
        'extensionButton.prominentForeground': bg,
        'extensionButton.prominentHoverBackground': accentHover,

        'focusBorder': accent,

        'input.background': surface,
        'input.border': border,

        'list.activeSelectionBackground': alpha(text, 0x20),
        'list.activeSelectionForeground': ink,
        'list.focusBackground': alpha(text, 0x20),
        'list.hoverBackground': alpha(text, 0x0d),
        'list.highlightForeground': ink,
        'list.inactiveSelectionBackground': alpha(text, 0x20),
        'list.inactiveSelectionForeground': ink,

        'peekView.border': accent,
        'peekViewEditor.background': surface,
        'peekViewResult.background': surface,
        'peekViewResult.selectionBackground': selection,
        'peekViewTitle.background': surface,

        'pickerGroup.border': accent,

        'scrollbarSlider.activeBackground': alpha(text, 0x50),
        'scrollbarSlider.background': alpha(text, 0x70),
        'scrollbarSlider.hoverBackground': alpha(text, 0x60),

        'sideBar.background': bg,
        'sideBarSectionHeader.background': bg,

        'statusBar.background': surface,
        'statusBar.debuggingForeground': surface,
        'statusBar.foreground': ink,
        'statusBar.noFolderBackground': surface,
        'statusBarItem.hoverBackground': border,

        'tab.activeBackground': bg,
        'tab.activeForeground': ink,
        'tab.border': border,
        'tab.inactiveBackground': surface,

        'titleBar.activeBackground': surface,
        'titleBar.activeForeground': ink,
        'titleBar.inactiveBackground': surface,
        'titleBar.inactiveForeground': ink,
    };
}

export function gitColors(): Record<string, string> {
    return {
        'gitDecoration.addedResourceForeground': status.added,
        'gitDecoration.conflictingResourceForeground': status.conflict,
        'gitDecoration.modifiedResourceForeground': status.modified,
        'gitDecoration.renamedResourceForeground': status.renamed,
        'gitDecoration.deletedResourceForeground': status.faded,
        'gitDecoration.untrackedResourceForeground': status.added,
        'gitDecoration.ignoredResourceForeground': status.ignored,
        'gitDecoration.stageDeletedResourceForeground': status.conflict,
        'gitDecoration.stageModifiedResourceForeground': status.staged,
        'gitDecoration.submoduleResourceForeground': status.faded,
    };
}
