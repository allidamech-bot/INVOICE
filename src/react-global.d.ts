declare namespace React {
  type ReactNode = any;
  interface SyntheticEvent<T = Element> { currentTarget: T; target: EventTarget & T; preventDefault(): void; stopPropagation(): void; }
  type SetStateAction<S> = S | ((prevState: S) => S);
  type Dispatch<A> = (value: A) => void;
  class Component<P = {}, S = {}> {
    constructor(props: P);
    props: Readonly<P>;
    state: Readonly<S>;
    setState<K extends keyof S>(state: Pick<S, K> | ((prevState: Readonly<S>, props: Readonly<P>) => Pick<S, K> | S | null), callback?: () => void): void;
    forceUpdate(callback?: () => void): void;
  }
  const Fragment: any;
  function createElement(type: any, props?: any, ...children: any[]): any;
  function useState<S>(initialState:S|(()=>S)): [S,Dispatch<SetStateAction<S>>];
  function useMemo<T>(factory:()=>T,deps:readonly any[]):T;
  function useEffect(effect:()=>void|(()=>void),deps?:readonly any[]):void;
}
declare const React: {
  Component: typeof React.Component;
  createElement: typeof React.createElement;
  Fragment: any;
  useState: typeof React.useState;
  useMemo: typeof React.useMemo;
  useEffect: typeof React.useEffect;
};
declare const ReactDOM: {
  render(element: any, container: Element | DocumentFragment): void;
  createPortal(element: any, container: Element | DocumentFragment): any;
};
declare namespace JSX {
  interface ElementChildrenAttribute { children: {}; }
  interface IntrinsicAttributes { key?: any; }
  interface IntrinsicElements { [elemName: string]: any }
}
