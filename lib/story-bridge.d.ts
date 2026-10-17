declare module "virtual:commonplace-story" {
  export const enabled: boolean;
  export function authorized(request: Request): boolean;
}
