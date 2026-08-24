declare namespace React {
  type ReactNode = any;
  interface SyntheticEvent<T = Element> { currentTarget: T; target: EventTarget & T; preventDefault(): void; stopPropagation(): void; }
  class Component<P = {}, S = {}> {
    constructor(props: P);
    props: Readonly<P>;
    state: Readonly<S>;
    setState<K extends keyof S>(state: Pick<S, K> | ((prevState: Readonly<S>, props: Readonly<P>) => Pick<S, K> | S | null), callback?: () => void): void;
    forceUpdate(callback?: () => void): void;
  }
  const Fragment: any;
  function createElement(type: any, props?: any, ...children: any[]): any;
}
declare const React: { Component: typeof React.Component; createElement: typeof React.createElement; Fragment: any };
declare const ReactDOM: { render(element: any, container: Element | DocumentFragment): void };
declare namespace JSX {
  interface ElementChildrenAttribute { children: {}; }
  interface IntrinsicAttributes { key?: any; }
  interface IntrinsicElements { [elemName: string]: any }
}
