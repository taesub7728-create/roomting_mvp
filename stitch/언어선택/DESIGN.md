---
name: Serene Pink
colors:
  surface: '#fef8f6'
  surface-dim: '#dfd9d7'
  surface-bright: '#fef8f6'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f9f2f0'
  surface-container: '#f3edea'
  surface-container-high: '#ede7e5'
  surface-container-highest: '#e7e1df'
  on-surface: '#1d1b1a'
  on-surface-variant: '#584144'
  inverse-surface: '#32302f'
  inverse-on-surface: '#f6efed'
  outline: '#8b7074'
  outline-variant: '#dfbfc3'
  surface-tint: '#af2851'
  primary: '#ac254f'
  on-primary: '#ffffff'
  primary-container: '#cd4066'
  on-primary-container: '#fffbff'
  inverse-primary: '#ffb2bf'
  secondary: '#665c5e'
  on-secondary: '#ffffff'
  secondary-container: '#ebdcdf'
  on-secondary-container: '#6a6063'
  tertiary: '#006b2d'
  on-tertiary: '#ffffff'
  tertiary-container: '#00873b'
  on-tertiary-container: '#f7fff3'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffd9de'
  primary-fixed-dim: '#ffb2bf'
  on-primary-fixed: '#3f0015'
  on-primary-fixed-variant: '#8e073a'
  secondary-fixed: '#eddfe2'
  secondary-fixed-dim: '#d1c3c6'
  on-secondary-fixed: '#211a1c'
  on-secondary-fixed-variant: '#4e4447'
  tertiary-fixed: '#7dfc97'
  tertiary-fixed-dim: '#60df7e'
  on-tertiary-fixed: '#002109'
  on-tertiary-fixed-variant: '#005321'
  background: '#fef8f6'
  on-background: '#1d1b1a'
  surface-variant: '#e7e1df'
  pink-dim: '#F8D6DE'
  ink-soft: '#8A8480'
  line: '#EFEBE7'
  paper: '#FFFFFF'
  inactive-gray: '#C3BCB6'
typography:
  display-lg:
    fontFamily: Manrope
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.2'
  headline-md:
    fontFamily: Manrope
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.3'
  headline-sm:
    fontFamily: Manrope
    fontSize: 20px
    fontWeight: '600'
    lineHeight: '1.4'
  body-lg:
    fontFamily: Noto Sans KR
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Noto Sans KR
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  body-sm:
    fontFamily: Noto Sans KR
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  label-md:
    fontFamily: Noto Sans KR
    fontSize: 12px
    fontWeight: '500'
    lineHeight: '1.4'
    letterSpacing: 0.02em
  numeral-md:
    fontFamily: Manrope
    fontSize: 16px
    fontWeight: '600'
    lineHeight: '1.2'
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  margin-mobile: 20px
  margin-desktop: 40px
  gutter: 16px
  section-gap: 48px
  element-gap: 12px
---

## Brand & Style

The brand personality is **effortless, transparent, and empathetic**. As a real estate matchmaking service, the design system must alleviate the stress of house hunting by providing a clean, "breathable" interface that prioritizes clarity over clutter. 

The aesthetic follows a **Minimalist-Modern** approach. It leverages generous whitespace to create a sense of calm, using a signature pink as a functional guide rather than a decorative distraction. By strictly avoiding "box nesting" (nested containers) and heavy borders, the interface achieves a lightweight, digital-native feel. The use of Lucide icons ensures a technical, precise look that replaces the informal nature of emojis with a professional, systematic visual language.

## Colors

The palette is anchored by **Pink (#E8547A)**, used exclusively for primary call-to-actions and active states to maintain high signal-to-noise ratios. 

- **Primary & Secondary:** The interaction between the core Pink and the soft Pink-soft background creates a gentle hierarchy.
- **Neutrals:** We use "Ink" for high-contrast readability and "Ink-soft" for secondary metadata. 
- **Surfaces:** To maximize the clean, modern aesthetic, we utilize a pure white "Paper" surface, moving away from off-whites to ensure the UI feels fresh and contemporary. 
- **Semantic lines:** Dividers use a very light beige-gray to maintain structure without creating harsh visual barriers.

## Typography

This design system employs a dual-font strategy to balance character with readability.

1. **Manrope (Headlines & Numerals):** Used for all headings, price points, and UI numbers. Its geometric construction adds a modern, tech-forward edge to the brand.
2. **Noto Sans KR (Body & Labels):** Provides maximum legibility for long-form content and user inputs. 

**Hierarchy Rules:**
- Use **Display-LG** only for landing page heroes.
- Use **Numeral-MD** for data points in tables or lists to ensure vertical alignment and a professional look.
- **Ink-soft** color should be applied to `body-sm` for secondary descriptions to keep the visual weight low.

## Layout & Spacing

The layout philosophy is **White-Space First**. We do not fill space simply because it is available; we use it to separate distinct mental models.

- **Mobile (430px Frame):** A single-column fluid layout with a 20px safe margin. Content should flow vertically with a focus on "One Action per Screen."
- **Admin Desktop:** A 12-column fixed grid for the main content area with a fixed 280px left sidebar. The right content area utilizes a `max-width: 1200px` to prevent line lengths from becoming unreadable on ultra-wide monitors.
- **Rhythm:** We use a 4px baseline grid. Internal component spacing (padding) typically uses 12px or 16px, while vertical gaps between unrelated sections should be at least 48px to maintain the "clean" narrative.

## Elevation & Depth

We avoid traditional heavy shadows in favor of **Tonal Layering and Flat Depth**.

- **Surfaces:** We use depth to indicate hierarchy. The primary background is `--paper` (#FFFFFF). Tonal depth is created by placing elements on `--pink-soft` or by using `--line` for subtle definition.
- **No Box Shadows:** Avoid shadows on cards or buttons. High-contrast backgrounds or thin `--line` borders are preferred to define boundaries.
- **Interactive Depth:** When a user interacts with a card, instead of a shadow, use a subtle 1px border of `--pink-dim` or a light background shift to indicate focus.
- **Admin Sidebar:** Uses a subtle vertical line (`--line`) on the right edge to separate navigation from the workspace, rather than a shadow.

## Shapes

The shape language is **Friendly-Refined**. 

- **Standard Radius:** 0.5rem (8px) for buttons, input fields, and standard cards.
- **Large Radius:** 1rem (16px) for main feature containers (like the primary request banner).
- **Tab Bar Active State:** Specifically uses a 10px radius for the background highlight of the active icon, creating a soft, approachable pill-like effect.
- **Form Inputs:** Must match the standard 8px radius to maintain a consistent systematic feel.

## Components

### Buttons
- **Primary:** Filled with `--pink`, text in `--paper`. 8px rounded corners. No border.
- **Secondary:** Filled with `--pink-soft`, text in `--pink`. Used for low-priority actions.
- **Ghost:** Transparent background, text in `--ink-soft`. Used for "Cancel" or "Back" actions.

### Navigation (Mobile Tab Bar)
- **Structure:** Fixed at bottom. 4 items: Home, Map, Chat, MY.
- **Active State:** Icon sits on a 10px rounded `--pink-soft` square. Label is `--pink`.
- **Inactive State:** Icon and Label are both `#C3BCB6`. No background.

### Cards
- **Rule:** Never nest cards.
- **Style:** 1px border of `--line` or simply separated by whitespace. Internal padding is a generous 20px.

### Inputs
- **Style:** Light gray background (#F5F5F5) or white with `--line` border. 
- **Focus:** 1px border of `--pink`.
- **Labels:** Always use `label-md` in `ink-soft` above the field.

### Icons (Lucide)
- **Stroke:** Always `currentColor`.
- **Weight:** Fixed at `stroke-width: 2`.
- **Size:** 24x24px for navigation/primary actions, 20x20px for inline/secondary info.