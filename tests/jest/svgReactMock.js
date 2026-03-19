const React = require('react')

const SvgReactMock = React.forwardRef(function SvgReactMock(props, ref) {
  return React.createElement('svg', { ref, ...props })
})

module.exports = {
  __esModule: true,
  default: SvgReactMock,
  ReactComponent: SvgReactMock,
}
