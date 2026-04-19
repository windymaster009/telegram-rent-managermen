function clearFlow(ctx) {
  ctx.session.flow = null;
  ctx.session.flowData = {};
}

function startFlow(ctx, flow, step, data = {}) {
  ctx.session.flow = flow;
  ctx.session.step = step;
  ctx.session.flowData = data;
}

function inFlow(ctx, flow) {
  return ctx.session.flow === flow;
}

module.exports = { clearFlow, startFlow, inFlow };
