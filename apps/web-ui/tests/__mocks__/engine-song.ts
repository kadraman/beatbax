export function resolveSong(ast: any) {
  // Return a minimal song model that Player.playAST can accept in tests.
  return { ast };
}
export default { resolveSong };
