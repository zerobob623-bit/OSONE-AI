import appPromise from "../server";

export default async function handler(req: any, res: any) {
  const app = await appPromise;
  return app(req, res);
}
