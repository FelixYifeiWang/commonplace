declare module "virtual:commonplace-story" {
  export function scheduleStoryWork(): void;
  export const enabled: boolean;
  export function authorized(request: Request): boolean;
}
