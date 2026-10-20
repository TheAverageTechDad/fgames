/** Fade the next board in without rebuilding its renderer. */
export function levelTransition(node: HTMLElement, level: number) {
 let previous = level;
 let animation: Animation | undefined;
 return {
  update(next: number) {
   if (next === previous) return;
   previous = next;
   if (matchMedia('(prefers-reduced-motion: reduce)').matches || !node.animate) return;
   animation?.cancel();
   animation = node.animate(
    [{ opacity: 0.25, transform: 'translateY(10px)' }, { opacity: 1, transform: 'translateY(0)' }],
    { duration: 230, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
   );
  },
  destroy() { animation?.cancel(); }
 };
}
