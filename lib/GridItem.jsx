
  /**
   * Translate x and y coordinates from pixels to grid units.
   * @param  {Number} top  Top position (relative to parent) in pixels.
   * @param  {Number} left Left position (relative to parent) in pixels.
   * @return {Object} x and y in grid units.
   */
  calcXY(top: number, left: number): { x: number, y: number } {
    const { margin, cols, rowHeight, w, h, maxRows } = this.props;
    const colWidth = this.calcColWidth();
    // left = colWidth * x + margin * (x + 1)
    // l = cx + m(x+1)
    // l = cx + mx + m
    // l - m = cx + mx
    // l - m = x(c + m)
    // (l - m) / (c + m) = x
    // x = (left - margin) / (coldWidth + margin)
    let x = Math.round((left - margin[0]) / (colWidth + margin[0]));
    let y = Math.round((top - margin[1]) / (rowHeight + margin[1]));
    // Capping
    x = Math.max(Math.min(x, cols - w), 0);
    y = Math.max(Math.min(y, maxRows - h), 0);
    return { x, y };
  }
  /**
   * Given a height and width in pixel values, calculate grid units.
   * @param  {Number} height Height in pixels.
   * @param  {Number} width  Width in pixels.
   * @return {Object} w, h as grid units.
   */
  calcWH({
    height,
    width
  }: {
    height: number,
    width: number
  }): { w: number, h: number } {
    const { margin, maxRows, cols, rowHeight, x, y } = this.props;
    const colWidth = this.calcColWidth();
    // width = colWidth * w - (margin * (w - 1))
    // ...
    // w = (width + margin) / (colWidth + margin)
    let w = Math.round((width + margin[0]) / (colWidth + margin[0]));
    let h = Math.round((height + margin[1]) / (rowHeight + margin[1]));
    // Capping
    w = Math.max(Math.min(w, cols - x), 0);
    h = Math.max(Math.min(h, maxRows - y), 0);
    return { w, h };
  }
  /**
   * This is where we set the grid item's absolute placement. It gets a little tricky because we want to do it
   * well when server rendering, and the only way to do that properly is to use percentage width/left because
   * we don't know exactly what the browser viewport is.
   * Unfortunately, CSS Transforms, which are great for performance, break in this instance because a percentage
   * left is relative to the item itself, not its container! So we cannot use them on the server rendering pass.
   *
   * @param  {Object} pos Position object with width, height, left, top.
   * @return {Object}     Style object.
   */
  createStyle(pos: Position): { [key: string]: ?string } {
  createStyle(
    pos: Position,
    transformDirection: ?Direction
  ): { [key: string]: ?string } {
    const { usePercentages, containerWidth, useCSSTransforms } = this.props;

    let style;
    // CSS Transforms support (default)
    if (useCSSTransforms) {
      style = setTransform(pos);
      style = setTransform(pos, transformDirection);
    } else {
      // top,left (slow)
      style = setTopLeft(pos);
      style = setTopLeft(pos, transformDirection);

      // This is used for server rendering.
      if (usePercentages) {
        style.left = perc(pos.left / containerWidth);
        style.width = perc(pos.width / containerWidth);
      }
    }
    return style;
  }
  /**
   * Mix a Draggable instance into a child.
   * @param  {Element} child    Child element.
   * @return {Element}          Child wrapped in Draggable.
   */
  mixinDraggable(child: ReactElement<any>): ReactElement<any> {
    return (
      <DraggableCore
        onStart={this.onDragHandler("onDragStart")}
        onDrag={this.onDragHandler("onDrag")}
        onStop={this.onDragHandler("onDragStop")}
        handle={this.props.handle}
        cancel={
          ".react-resizable-handle" +
          (this.props.cancel ? "," + this.props.cancel : "")
        }
      >
        {child}
      </DraggableCore>
    );
  }
  /**
   * Mix a Resizable instance into a child.
   * @param  {Element} child    Child element.
   * @param  {Object} position  Position object (pixel values)
   * @return {Element}          Child wrapped in Resizable.
   */
  mixinResizable(
    child: ReactElement<any>,
    position: Position
  ): ReactElement<any> {
    const { cols, x, minW, minH, maxW, maxH } = this.props;
    // This is the max possible width - doesn't go to infinity because of the width of the window
    const maxWidth = this.calcPosition(0, 0, cols - x, 0).width;
    // Calculate min/max constraints using our min & maxes
    const mins = this.calcPosition(0, 0, minW, minH);
    const maxes = this.calcPosition(0, 0, maxW, maxH);
    const minConstraints = [mins.width, mins.height];
    const maxConstraints = [
      Math.min(maxes.width, maxWidth),
      Math.min(maxes.height, Infinity)
    ];
    return (
      <Resizable
        width={position.width}
        height={position.height}
        minConstraints={minConstraints}
        maxConstraints={maxConstraints}
        onResizeStop={this.onResizeHandler("onResizeStop")}
        onResizeStart={this.onResizeHandler("onResizeStart")}
        onResize={this.onResizeHandler("onResize")}
      >
        {child}
      </Resizable>
    );
  }
  /**
   * Wrapper around drag events to provide more useful data.
   * All drag events call the function with the given handler name,
   * with the signature (index, x, y).
   *
   * @param  {String} handlerName Handler name to wrap.
   * @return {Function}           Handler function.
   */
  onDragHandler(handlerName: string) {
    return (e: Event, { node, deltaX, deltaY }: ReactDraggableCallbackData) => {
      const handler = this.props[handlerName];
      const { transformDirection } = this.props;
      if (!handler) return;

      const newPosition: PartialPosition = { top: 0, left: 0 };
      // Get new XY
      switch (handlerName) {
        case "onDragStart": {
          // TODO: this wont work on nested parents
          const { offsetParent } = node;
          if (!offsetParent) return;
          const parentRect = offsetParent.getBoundingClientRect();
          const clientRect = node.getBoundingClientRect();
          newPosition.left =
            clientRect.left - parentRect.left + offsetParent.scrollLeft;
          if (transformDirection === "rtl") {
            newPosition.left = -(
              clientRect.right -
              parentRect.right -
              offsetParent.scrollLeft
            );
          } else {
            newPosition.left =
              clientRect.left - parentRect.left + offsetParent.scrollLeft;
          }

          newPosition.top =
            clientRect.top - parentRect.top + offsetParent.scrollTop;
          this.setState({ dragging: newPosition });
          break;
        }
        case "onDrag":
          if (!this.state.dragging)
            throw new Error("onDrag called before onDragStart.");
          newPosition.left = this.state.dragging.left + deltaX;
          newPosition.left =
            this.state.dragging.left +
            (transformDirection === "rtl" ? -deltaX : deltaX);
          newPosition.top = this.state.dragging.top + deltaY;
          this.setState({ dragging: newPosition });
          break;
        case "onDragStop":
          if (!this.state.dragging)
            throw new Error("onDragEnd called before onDragStart.");
          newPosition.left = this.state.dragging.left;
          newPosition.top = this.state.dragging.top;
          this.setState({ dragging: null });
          break;
        default:
          throw new Error(
            "onDragHandler called with unrecognized handlerName: " + handlerName
          );
      }
      const { x, y } = this.calcXY(newPosition.top, newPosition.left);
      return handler.call(this, this.props.i, x, y, { e, node, newPosition });
    };
  }
  /**
   * Wrapper around drag events to provide more useful data.
   * All drag events call the function with the given handler name,
   * with the signature (index, x, y).
   *
   * @param  {String} handlerName Handler name to wrap.
   * @return {Function}           Handler function.
   */
  onResizeHandler(handlerName: string) {
    return (
      e: Event,
      { node, size }: { node: HTMLElement, size: Position }
    ) => {
      const handler = this.props[handlerName];
      if (!handler) return;
      const { cols, x, i, maxW, minW, maxH, minH } = this.props;
      // Get new XY
      let { w, h } = this.calcWH(size);
      // Cap w at numCols
      w = Math.min(w, cols - x);
      // Ensure w is at least 1
      w = Math.max(w, 1);
      // Min/max capping
      w = Math.max(Math.min(w, maxW), minW);
      h = Math.max(Math.min(h, maxH), minH);
      this.setState({ resizing: handlerName === "onResizeStop" ? null : size });
      handler.call(this, i, w, h, { e, node, size });
    };
  }
  render(): ReactNode {
    const {
      x,
      y,
      w,
      h,
      isDraggable,
      isResizable,
      useCSSTransforms
      useCSSTransforms,
      transformDirection
    } = this.props;

    const pos = this.calcPosition(x, y, w, h, this.state);
    const child = React.Children.only(this.props.children);
    // Create the child element. We clone the existing element but modify its className and style.
    let newChild = React.cloneElement(child, {
      className: classNames(
        "react-grid-item",
        transformDirection,
        child.props.className,
        this.props.className,
        {
          static: this.props.static,
          resizing: Boolean(this.state.resizing),
          "react-draggable": isDraggable,
          "react-draggable-dragging": Boolean(this.state.dragging),
          cssTransforms: useCSSTransforms
        }
      ),
      // We can set the width and height on the child, but unfortunately we can't set the position.
      style: {
        ...this.props.style,
        ...child.props.style,
        ...this.createStyle(pos)
        ...this.createStyle(pos, transformDirection)
      }
    });

    // Resizable support. This is usually on but the user can toggle it off.
    if (isResizable) newChild = this.mixinResizable(newChild, pos);
    // Draggable support. This is always on, except for with placeholders.
    if (isDraggable) newChild = this.mixinDraggable(newChild);
    return newChild;
  }
}
