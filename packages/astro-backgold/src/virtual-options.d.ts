// The options module the integration's Vite plugin serves to the injected routes.
declare module 'virtual:backgold/options' {
  const options: import('./options.js').RuntimeBackgoldOptions
  export default options
}
