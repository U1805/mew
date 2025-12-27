import { Request, Response, NextFunction } from 'express';
import { ZodTypeAny } from 'zod';

const validate = (schema: ZodTypeAny) => (req: Request, res: Response, next: NextFunction) => {
  const parsed = schema.safeParse({
    body: req.body,
    query: req.query,
    params: req.params,
  });

  if (!parsed.success) {
    const errors = parsed.error.issues.map((issue) => {
      const pathParts = issue.path[0] === 'body' ? issue.path.slice(1) : issue.path;
      return { path: pathParts.join('.'), message: issue.message };
    });

    return res.status(400).json({
      message: errors[0]?.message || 'Validation error',
      errors,
    });
  }

  const data: any = parsed.data as any;

  const replaceInPlace = (target: any, nextValue: any) => {
    if (!target || typeof target !== 'object') return nextValue;
    for (const k of Object.keys(target)) delete target[k];
    Object.assign(target, nextValue);
    return target;
  };

  if (Object.prototype.hasOwnProperty.call(data, 'body')) req.body = data.body;
  if (Object.prototype.hasOwnProperty.call(data, 'query')) replaceInPlace(req.query, data.query);
  if (Object.prototype.hasOwnProperty.call(data, 'params')) replaceInPlace(req.params, data.params);
  next();
};

export default validate;
