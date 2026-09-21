/// <reference types="react" />

// Declare global custom element for iconify-icon web component
declare namespace JSX {
  interface IntrinsicElements {
    "iconify-icon": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        icon?: string;
        width?: string | number;
        height?: string | number;
        style?: React.CSSProperties;
      },
      HTMLElement
    >;
  }
}
