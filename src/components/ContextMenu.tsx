import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  STATUS_COLORS,
  TopologyNode,
  TopologyEdge,
  NodeType,
  EdgeType,
  FlowSpeed,
  AnchorPoint,
  NODE_TYPE_CONFIG,
} from '../types';
import { NodeEditSection, EdgeEditSection } from '../utils/panelEvents';

/**
 * ContextMenu — hybrid click-ops context menu for canvas nodes and edges.
 *
 * Two coexisting kinds of menu items:
 *   1. In-menu click-ops: single-field mutations that resolve instantly
 *      (Change type, Compact mode, Bidirectional, Flow animation, Flow
 *      speed, Anchors). These call the pure helpers in nodeMutations /
 *      edgeMutations via props supplied by TopologyPanel.
 *   2. Sidebar redirects: items that fire section-targeted edit requests
 *      (Edit metrics, Edit alert matchers, Edit thresholds, etc.) so the
 *      sidebar card opens scrolled to the relevant sub-section. Used for
 *      complex fields that would require a mini-form to edit in-canvas.
 *
 * Depth-2 submenus only. Click-to-open (not hover). Position clamped to
 * panelRect; submenus flip left on overflow. Full keyboard navigation:
 * ArrowUp/Down cycles within the current level, ArrowRight opens a
 * submenu on the focused item, ArrowLeft/Escape closes the deepest
 * level. Outside-click on the document (not on any role="menu" element)
 * closes the whole menu.
 *
 * All new prop callbacks are optional. Items only render when their
 * corresponding callback is wired — so older consumers still work with
 * the 4-callback shape (onEdit/onDuplicate/onDelete/onClose).
 */

export type ContextMenuTarget = { type: 'node' | 'edge'; id: string };

/** Internal menu-item model built from props + current target. */
type MenuItem =
  | { kind: 'divider' }
  | {
      kind: 'item';
      label: string;
      onClick: () => void;
      destructive?: boolean;
      checked?: boolean;
    }
  | {
      kind: 'submenu';
      label: string;
      items: MenuItem[];
    };

export interface ContextMenuProps {
  target: ContextMenuTarget | null;
  position: { x: number; y: number } | null;
  panelRect: { width: number; height: number } | null;
  isEditMode: boolean;
  // Existing simple callbacks
  onEdit: (target: ContextMenuTarget) => void;
  onDuplicate: (target: ContextMenuTarget) => void;
  onDelete: (target: ContextMenuTarget) => void;
  onClose: () => void;
  // Context data for click-ops checkmarks + submenus
  nodes?: TopologyNode[];
  edges?: TopologyEdge[];
  // Node in-menu click-ops (optional — items only render when wired)
  onChangeNodeType?: (nodeId: string, newType: NodeType) => void;
  onToggleNodeCompact?: (nodeId: string) => void;
  // Edge in-menu click-ops
  onChangeEdgeType?: (edgeId: string, newType: EdgeType) => void;
  onToggleEdgeBidirectional?: (edgeId: string) => void;
  onToggleEdgeFlowAnimation?: (edgeId: string) => void;
  onSetEdgeFlowSpeed?: (edgeId: string, speed: FlowSpeed | undefined) => void;
  onSetEdgeAnchor?: (edgeId: string, side: 'source' | 'target', anchor: AnchorPoint) => void;
  // Sidebar-redirect callbacks
  onEditNodeSection?: (nodeId: string, section: NodeEditSection) => void;
  onEditEdgeSection?: (edgeId: string, section: EdgeEditSection) => void;
}

const MENU_W = 220;
const ITEM_H = 30;
const DIVIDER_H = 9;
const ROOT_PADDING = 8;

const NODE_TYPE_ORDER: NodeType[] = Object.keys(NODE_TYPE_CONFIG) as NodeType[];

const EDGE_TYPE_OPTIONS: Array<{ type: EdgeType; label: string }> = [
  { type: 'traffic', label: 'Traffic' },
  { type: 'ha_sync', label: 'HA sync' },
  { type: 'failover', label: 'Failover' },
  { type: 'monitor', label: 'Monitor' },
  { type: 'response', label: 'Response' },
  { type: 'custom', label: 'Custom' },
];

const FLOW_SPEED_OPTIONS: Array<{ speed: FlowSpeed | undefined; label: string }> = [
  { speed: undefined, label: 'Inherit from panel' },
  { speed: 'auto', label: 'Auto' },
  { speed: 'slow', label: 'Slow' },
  { speed: 'normal', label: 'Normal' },
  { speed: 'fast', label: 'Fast' },
  { speed: 'none', label: 'None' },
];

const ANCHOR_OPTIONS: Array<{ anchor: AnchorPoint; label: string }> = [
  { anchor: 'auto', label: 'Auto' },
  { anchor: 'top', label: 'Top' },
  { anchor: 'bottom', label: 'Bottom' },
  { anchor: 'left', label: 'Left' },
  { anchor: 'right', label: 'Right' },
];

// ─── Menu builders ────────────────────────────────────────────────────
//
// Pure functions: (target, props, closeAll) → MenuItem[]. No side effects
// until the user clicks an item (its onClick fires a prop then closes).

function buildNodeMenu(
  target: ContextMenuTarget,
  props: ContextMenuProps,
  closeAll: () => void
): MenuItem[] {
  const node = props.nodes?.find((n) => n.id === target.id);
  const items: MenuItem[] = [];

  if (props.isEditMode) {
    items.push({
      kind: 'item',
      label: 'Edit in sidebar',
      onClick: () => {
        props.onEdit(target);
        closeAll();
      },
    });
    items.push({ kind: 'divider' });
  }

  if (props.isEditMode && node) {
    // In-menu click-ops
    if (props.onChangeNodeType) {
      items.push({
        kind: 'submenu',
        label: 'Change type',
        items: NODE_TYPE_ORDER.map((t) => ({
          kind: 'item' as const,
          label: `${NODE_TYPE_CONFIG[t].icon}  ${t}`,
          checked: node.type === t,
          onClick: () => {
            props.onChangeNodeType!(target.id, t);
            closeAll();
          },
        })),
      });
    }
    if (props.onToggleNodeCompact) {
      items.push({
        kind: 'item',
        label: 'Compact mode',
        checked: node.compact,
        onClick: () => {
          props.onToggleNodeCompact!(target.id);
          closeAll();
        },
      });
    }
    items.push({ kind: 'divider' });

    // Sidebar redirects
    if (props.onEditNodeSection) {
      items.push({
        kind: 'item',
        label: 'Edit metrics',
        onClick: () => {
          props.onEditNodeSection!(target.id, 'metrics');
          closeAll();
        },
      });
      items.push({
        kind: 'item',
        label: 'Edit alert matchers',
        onClick: () => {
          props.onEditNodeSection!(target.id, 'alertMatchers');
          closeAll();
        },
      });
      items.push({
        kind: 'item',
        label: 'Edit observability links',
        onClick: () => {
          props.onEditNodeSection!(target.id, 'observabilityLinks');
          closeAll();
        },
      });
      items.push({ kind: 'divider' });
    }
  }

  // Standard bottom block (always rendered)
  items.push({
    kind: 'item',
    label: 'Duplicate',
    onClick: () => {
      props.onDuplicate(target);
      closeAll();
    },
  });
  items.push({
    kind: 'item',
    label: 'Copy node id',
    onClick: () => {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        navigator.clipboard.writeText(target.id).catch(() => {
          // clipboard write can fail in unfocused iframes — silent no-op
        });
      }
      closeAll();
    },
  });
  items.push({
    kind: 'item',
    label: 'Delete',
    destructive: true,
    onClick: () => {
      props.onDelete(target);
      closeAll();
    },
  });

  return items;
}

function buildEdgeMenu(
  target: ContextMenuTarget,
  props: ContextMenuProps,
  closeAll: () => void
): MenuItem[] {
  const edge = props.edges?.find((e) => e.id === target.id);
  const items: MenuItem[] = [];

  if (props.isEditMode) {
    items.push({
      kind: 'item',
      label: 'Edit in sidebar',
      onClick: () => {
        props.onEdit(target);
        closeAll();
      },
    });
    items.push({ kind: 'divider' });
  }

  if (props.isEditMode && edge) {
    if (props.onChangeEdgeType) {
      items.push({
        kind: 'submenu',
        label: 'Change type',
        items: EDGE_TYPE_OPTIONS.map((opt) => ({
          kind: 'item' as const,
          label: opt.label,
          checked: edge.type === opt.type,
          onClick: () => {
            props.onChangeEdgeType!(target.id, opt.type);
            closeAll();
          },
        })),
      });
    }
    if (props.onSetEdgeAnchor) {
      items.push({
        kind: 'submenu',
        label: 'Anchor source',
        items: ANCHOR_OPTIONS.map((opt) => ({
          kind: 'item' as const,
          label: opt.label,
          checked: edge.anchorSource === opt.anchor,
          onClick: () => {
            props.onSetEdgeAnchor!(target.id, 'source', opt.anchor);
            closeAll();
          },
        })),
      });
      items.push({
        kind: 'submenu',
        label: 'Anchor target',
        items: ANCHOR_OPTIONS.map((opt) => ({
          kind: 'item' as const,
          label: opt.label,
          checked: edge.anchorTarget === opt.anchor,
          onClick: () => {
            props.onSetEdgeAnchor!(target.id, 'target', opt.anchor);
            closeAll();
          },
        })),
      });
    }
    if (props.onSetEdgeFlowSpeed) {
      items.push({
        kind: 'submenu',
        label: 'Flow speed',
        items: FLOW_SPEED_OPTIONS.map((opt) => ({
          kind: 'item' as const,
          label: opt.label,
          checked: edge.flowSpeed === opt.speed,
          onClick: () => {
            props.onSetEdgeFlowSpeed!(target.id, opt.speed);
            closeAll();
          },
        })),
      });
    }
    if (props.onToggleEdgeBidirectional) {
      items.push({
        kind: 'item',
        label: 'Bidirectional',
        checked: edge.bidirectional,
        onClick: () => {
          props.onToggleEdgeBidirectional!(target.id);
          closeAll();
        },
      });
    }
    if (props.onToggleEdgeFlowAnimation) {
      items.push({
        kind: 'item',
        label: 'Flow animation',
        checked: edge.flowAnimation,
        onClick: () => {
          props.onToggleEdgeFlowAnimation!(target.id);
          closeAll();
        },
      });
    }
    items.push({ kind: 'divider' });

    if (props.onEditEdgeSection) {
      items.push({
        kind: 'item',
        label: 'Edit metric binding',
        onClick: () => {
          props.onEditEdgeSection!(target.id, 'metric');
          closeAll();
        },
      });
      items.push({
        kind: 'item',
        label: 'Edit thresholds',
        onClick: () => {
          props.onEditEdgeSection!(target.id, 'thresholds');
          closeAll();
        },
      });
      items.push({
        kind: 'item',
        label: 'Edit state map',
        onClick: () => {
          props.onEditEdgeSection!(target.id, 'stateMap');
          closeAll();
        },
      });
      items.push({
        kind: 'item',
        label: 'Edit visual',
        onClick: () => {
          props.onEditEdgeSection!(target.id, 'visual');
          closeAll();
        },
      });
      items.push({ kind: 'divider' });
    }
  }

  items.push({
    kind: 'item',
    label: 'Duplicate',
    onClick: () => {
      props.onDuplicate(target);
      closeAll();
    },
  });
  items.push({
    kind: 'item',
    label: 'Delete',
    destructive: true,
    onClick: () => {
      props.onDelete(target);
      closeAll();
    },
  });

  return items;
}

// ─── Sizing + clamping helpers ────────────────────────────────────────

function estimateMenuHeight(items: MenuItem[]): number {
  let h = ROOT_PADDING;
  for (const it of items) {
    h += it.kind === 'divider' ? DIVIDER_H : ITEM_H;
  }
  return h;
}

function clampRootPosition(
  x: number,
  y: number,
  width: number,
  height: number,
  panelRect: { width: number; height: number } | null
): { x: number; y: number } {
  let cx = x;
  let cy = y;
  if (panelRect) {
    if (cx + width > panelRect.width) {
      cx = Math.max(8, panelRect.width - width - 8);
    }
    if (cy + height > panelRect.height) {
      cy = Math.max(8, panelRect.height - height - 8);
    }
  }
  if (cx < 8) { cx = 8; }
  if (cy < 8) { cy = 8; }
  return { x: cx, y: cy };
}

function clampSubmenuPosition(
  anchorRight: number,
  anchorLeft: number,
  top: number,
  width: number,
  height: number,
  panelRect: { width: number; height: number } | null
): { x: number; y: number } {
  let x = anchorRight;
  let y = top;
  if (panelRect) {
    if (x + width > panelRect.width) {
      // Flip left: align submenu's right edge to the parent's left edge
      x = Math.max(8, anchorLeft - width);
    }
    if (y + height > panelRect.height) {
      y = Math.max(8, panelRect.height - height - 8);
    }
  }
  if (x < 8) { x = 8; }
  if (y < 8) { y = 8; }
  return { x, y };
}

// ─── Item-level styling ───────────────────────────────────────────────

const itemBaseStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '6px 12px',
  background: 'transparent',
  border: 'none',
  color: '#d8dee9',
  fontSize: 12,
  textAlign: 'left',
  cursor: 'pointer',
  fontFamily: 'inherit',
  position: 'relative',
};

const dividerStyle: React.CSSProperties = {
  height: 1,
  background: '#2d3748',
  margin: '4px 0',
};

// ─── <MenuPanel> — renders a flat list of MenuItem[] at absolute pos ──
//
// Not recursive. Reports submenu-open requests upward via onSubmenuOpen.
// Only the deepest visible level owns keyboard focus; the root's keydown
// handler handles ArrowRight/ArrowLeft to open/close submenus.

interface MenuPanelProps {
  items: MenuItem[];
  position: { x: number; y: number };
  ariaLabel: string;
  testid: string;
  onSubmenuOpen: (itemIdx: number, anchor: { right: number; left: number; top: number }) => void;
  onEscape: () => void;
  isSubmenu: boolean;
  allowSubmenus: boolean;
  /**
   * When false, the document-level keydown handler short-circuits without
   * processing arrow keys / Escape. Used to silence the root MenuPanel
   * while a submenu is open so a single ArrowDown doesn't move focus in
   * both panels simultaneously (visible jitter).
   */
  isActive: boolean;
}

/**
 * Walks the items[] and returns the index (within items[]) of the nth
 * rendered menuitem, skipping dividers. Returns null if menuitemIdx is
 * out of range.
 */
function mapMenuitemIndexToItemIdx(items: MenuItem[], menuitemIdx: number): number | null {
  let n = 0;
  for (let i = 0; i < items.length; i++) {
    if (items[i].kind !== 'divider') {
      if (n === menuitemIdx) {
        return i;
      }
      n++;
    }
  }
  return null;
}

const MenuPanel: React.FC<MenuPanelProps> = ({
  items,
  position,
  ariaLabel,
  testid,
  onSubmenuOpen,
  onEscape,
  isSubmenu,
  allowSubmenus,
  isActive,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Initial focus on first menuitem (deferred one microtask so the DOM
  // is painted before the query).
  useEffect(() => {
    queueMicrotask(() => {
      if (!containerRef.current) { return; }
      const first = containerRef.current.querySelector<HTMLElement>('[role="menuitem"]');
      if (first) { first.focus(); }
    });
  }, []);

  // Keyboard navigation scoped to this level. Inactive panels (the root
  // while a submenu is open) short-circuit so a single keystroke doesn't
  // get processed by both panels and produce visible focus jitter.
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (!isActive) { return; }
      if (e.key === 'Escape') {
        e.preventDefault();
        onEscape();
        return;
      }
      if (!containerRef.current) { return; }
      const itemEls = Array.from(
        containerRef.current.querySelectorAll<HTMLElement>('[role="menuitem"]')
      );
      if (itemEls.length === 0) { return; }
      const active = document.activeElement as HTMLElement | null;
      const activeIdx = itemEls.indexOf(active as HTMLElement);

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        // When focus is outside the menu (activeIdx === -1), ArrowDown
        // jumps to the first item and ArrowUp to the last — explicit
        // branch avoids the prior off-by-one (`((-1) + (-1) + N) % N` skipped
        // the last item on first ArrowUp).
        let nextIdx: number;
        if (activeIdx < 0) {
          nextIdx = e.key === 'ArrowDown' ? 0 : itemEls.length - 1;
        } else {
          const delta = e.key === 'ArrowDown' ? 1 : -1;
          nextIdx = (activeIdx + delta + itemEls.length) % itemEls.length;
        }
        itemEls[nextIdx].focus();
        return;
      }
      if (e.key === 'ArrowLeft' && isSubmenu) {
        e.preventDefault();
        onEscape();
        return;
      }
      if (e.key === 'ArrowRight' && activeIdx >= 0 && allowSubmenus) {
        const itemIdxAtFocus = mapMenuitemIndexToItemIdx(items, activeIdx);
        if (itemIdxAtFocus !== null && items[itemIdxAtFocus].kind === 'submenu') {
          e.preventDefault();
          const rect = itemEls[activeIdx].getBoundingClientRect();
          onSubmenuOpen(itemIdxAtFocus, { right: rect.right, left: rect.left, top: rect.top });
        }
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [items, onEscape, onSubmenuOpen, isSubmenu, allowSubmenus, isActive]);

  return (
    <div
      ref={containerRef}
      role="menu"
      aria-label={ariaLabel}
      data-testid={testid}
      style={{
        position: 'absolute',
        left: position.x,
        top: position.y,
        width: MENU_W,
        background: '#1a1e24',
        border: '1px solid #2d3748',
        borderRadius: 6,
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        zIndex: 200,
        padding: 4,
        maxHeight: '70vh',
        overflowY: 'auto',
      }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {items.map((item, idx) => {
        if (item.kind === 'divider') {
          return <div key={`div-${idx}`} style={dividerStyle} aria-hidden="true" />;
        }
        if (item.kind === 'submenu') {
          return (
            <button
              key={`sub-${idx}`}
              type="button"
              role="menuitem"
              aria-haspopup="menu"
              style={itemBaseStyle}
              onClick={(e) => {
                e.stopPropagation();
                if (!allowSubmenus) { return; }
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                onSubmenuOpen(idx, { right: rect.right, left: rect.left, top: rect.top });
              }}
            >
              <span aria-hidden="true" style={{ display: 'inline-block', width: 14 }} />
              {item.label}
              <span
                aria-hidden="true"
                style={{ position: 'absolute', right: 8, top: 6, color: '#616e88' }}
              >
                ▸
              </span>
            </button>
          );
        }
        // plain item — label is a direct text child of the button so
        // screen.getByText('Label') returns the button element itself (not
        // a nested span). The leading checkmark column is an aria-hidden
        // spacer span with empty content when unchecked, so it contributes
        // no textContent to the button.
        const style: React.CSSProperties = {
          ...itemBaseStyle,
          ...(item.destructive ? { color: STATUS_COLORS.critical } : {}),
        };
        return (
          <button
            key={`item-${idx}`}
            type="button"
            role="menuitem"
            style={style}
            onClick={(e) => {
              e.stopPropagation();
              item.onClick();
            }}
          >
            {item.checked ? (
              <span
                aria-hidden="true"
                style={{ display: 'inline-block', width: 14, color: '#a3be8c' }}
                data-testid="contextmenu-check"
              >
                ✓
              </span>
            ) : (
              <span aria-hidden="true" style={{ display: 'inline-block', width: 14 }} />
            )}
            {item.label}
          </button>
        );
      })}
    </div>
  );
};

// ─── Root ContextMenu component ───────────────────────────────────────

export const ContextMenu: React.FC<ContextMenuProps> = (props) => {
  const { target, position, panelRect, onClose } = props;
  const [submenuState, setSubmenuState] = useState<{
    itemIdx: number;
    anchor: { right: number; left: number; top: number };
  } | null>(null);

  const closeAll = useCallback(() => {
    setSubmenuState(null);
    onClose();
  }, [onClose]);

  // Build menu on every render — cheap (arrays of string labels).
  const rootItems = useMemo<MenuItem[]>(() => {
    if (!target) { return []; }
    if (target.type === 'node') {
      return buildNodeMenu(target, props, closeAll);
    }
    return buildEdgeMenu(target, props, closeAll);
    // The full prop callback set (onChangeNodeType, onToggleNodeCompact,
    // onChangeEdgeType, onSetEdgeAnchor, ...) is passed in as stable
    // useCallback refs from TopologyPanel. Listing them here would cause
    // rebuilds on every parent re-render with no semantic change. We
    // intentionally rebuild only when the target, edit mode, or the node/
    // edge slice arrays change — those are the inputs the menu items read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, props.isEditMode, props.nodes, props.edges]);

  // Reset submenu when target changes
  useEffect(() => {
    setSubmenuState(null);
  }, [target]);

  // Outside-click closes the whole stack
  useEffect(() => {
    if (!target) { return; }
    const handleMouseDown = (e: MouseEvent) => {
      const path = (e.composedPath ? e.composedPath() : []) as Element[];
      const inMenu = path.some(
        (el) => el && (el as Element).getAttribute && (el as Element).getAttribute('role') === 'menu'
      );
      if (inMenu) { return; }
      closeAll();
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [target, closeAll]);

  if (!target || !position) {
    return null;
  }

  const rootHeight = estimateMenuHeight(rootItems);
  const rootClamped = clampRootPosition(position.x, position.y, MENU_W, rootHeight, panelRect);

  const handleRootSubmenuOpen = (itemIdx: number, anchor: { right: number; left: number; top: number }) => {
    setSubmenuState({ itemIdx, anchor });
  };

  const handleSubmenuEscape = () => {
    setSubmenuState(null);
  };

  const rootEscape = () => {
    if (submenuState !== null) {
      setSubmenuState(null);
    } else {
      closeAll();
    }
  };

  const openSubmenu =
    submenuState !== null && rootItems[submenuState.itemIdx]?.kind === 'submenu'
      ? (rootItems[submenuState.itemIdx] as Extract<MenuItem, { kind: 'submenu' }>)
      : null;

  // Submenu position: right of the parent item's right edge; flip left on overflow.
  const submenuPosition = submenuState && openSubmenu
    ? clampSubmenuPosition(
        submenuState.anchor.right,
        submenuState.anchor.left,
        submenuState.anchor.top,
        MENU_W,
        estimateMenuHeight(openSubmenu.items),
        panelRect
      )
    : null;

  return (
    <>
      <MenuPanel
        items={rootItems}
        position={rootClamped}
        ariaLabel={`${target.type} context menu`}
        testid="topology-context-menu"
        onSubmenuOpen={handleRootSubmenuOpen}
        onEscape={rootEscape}
        isSubmenu={false}
        allowSubmenus={true}
        isActive={openSubmenu === null}
      />
      {openSubmenu && submenuPosition && (
        <MenuPanel
          key={`submenu-${submenuState?.itemIdx}`}
          items={openSubmenu.items}
          position={submenuPosition}
          ariaLabel={`${openSubmenu.label} submenu`}
          testid="topology-context-submenu"
          onSubmenuOpen={() => { /* depth-2 only — no nesting */ }}
          onEscape={handleSubmenuEscape}
          isSubmenu={true}
          allowSubmenus={false}
          isActive={true}
        />
      )}
    </>
  );
};
