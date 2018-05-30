// @flow

import createListComponent from './createListComponent';

import type { Props, ScrollToAlign } from './createListComponent';

const DEFAULT_ESTIMATED_ITEM_SIZE = 50;

type DynanmicProps = {|
  estimatedItemSize: number,
  ...Props,
|};

type itemSizeGetter = (index: number) => number;

type CellMetadata = {|
  offset: number,
  size: number,
|};
type InstanceProps = {|
  cellMetadataMap: { [index: number]: CellMetadata },
  estimatedItemSize: number,
  lastMeasuredIndex: number,
|};

const getCellMetadata = (
  props: Props,
  index: number,
  instanceProps: InstanceProps
): CellMetadata => {
  const { itemSize } = ((props: any): DynanmicProps);
  const { cellMetadataMap, lastMeasuredIndex } = instanceProps;

  if (index > lastMeasuredIndex) {
    let offset = 0;
    if (lastMeasuredIndex >= 0) {
      const cellMetadata = cellMetadataMap[lastMeasuredIndex];
      offset = cellMetadata.offset + cellMetadata.size;
    }

    for (let i = lastMeasuredIndex + 1; i <= index; i++) {
      let size = ((itemSize: any): itemSizeGetter)(i);

      cellMetadataMap[i] = {
        offset,
        size,
      };

      offset += size;
    }

    instanceProps.lastMeasuredIndex = index;
  }

  return cellMetadataMap[index];
};

const findNearestCell = (
  props: Props,
  instanceProps: InstanceProps,
  offset: number
) => {
  const { cellMetadataMap, lastMeasuredIndex } = instanceProps;

  const lastMeasuredCellOffset =
    lastMeasuredIndex > 0 ? cellMetadataMap[lastMeasuredIndex].offset : 0;

  if (lastMeasuredCellOffset >= offset) {
    // If we've already measured cells within this range just use a binary search as it's faster.
    return findNearestCellBinarySearch(
      props,
      instanceProps,
      lastMeasuredIndex,
      0,
      offset
    );
  } else {
    // If we haven't yet measured this high, fallback to an exponential search with an inner binary search.
    // The exponential search avoids pre-computing sizes for the full set of cells as a binary search would.
    // The overall complexity for this approach is O(log n).
    return findNearestCellExponentialSearch(
      props,
      instanceProps,
      lastMeasuredIndex,
      offset
    );
  }
};

const findNearestCellBinarySearch = (
  props: Props,
  instanceProps: InstanceProps,
  high: number,
  low: number,
  offset: number
): number => {
  while (low <= high) {
    const middle = low + Math.floor((high - low) / 2);
    const currentOffset = getCellMetadata(props, middle, instanceProps).offset;

    if (currentOffset === offset) {
      return middle;
    } else if (currentOffset < offset) {
      low = middle + 1;
    } else if (currentOffset > offset) {
      high = middle - 1;
    }
  }

  if (low > 0) {
    return low - 1;
  } else {
    return 0;
  }
};

const findNearestCellExponentialSearch = (
  props: Props,
  instanceProps: InstanceProps,
  index: number,
  offset: number
): number => {
  const { count } = props;
  let interval = 1;

  while (
    index < count &&
    getCellMetadata(props, index, instanceProps).offset < offset
  ) {
    index += interval;
    interval *= 2;
  }

  return findNearestCellBinarySearch(
    props,
    instanceProps,
    Math.min(index, count - 1),
    Math.floor(index / 2),
    offset
  );
};

const getEstimatedTotalSize = (
  { count }: Props,
  { cellMetadataMap, estimatedItemSize, lastMeasuredIndex }: InstanceProps
) => {
  let totalSizeOfMeasuredCells = 0;

  if (lastMeasuredIndex >= 0) {
    const cellMetadata = cellMetadataMap[lastMeasuredIndex];
    totalSizeOfMeasuredCells = cellMetadata.offset + cellMetadata.size;
  }

  const numUnmeasuredCells = count - lastMeasuredIndex - 1;
  const totalSizeOfUnmeasuredCells = numUnmeasuredCells * estimatedItemSize;

  return totalSizeOfMeasuredCells + totalSizeOfUnmeasuredCells;
};

const VariableSizeList = createListComponent({
  getCellOffset: (
    props: Props,
    index: number,
    instanceProps: InstanceProps
  ): number => getCellMetadata(props, index, instanceProps).offset,

  getItemSize: (
    props: Props,
    index: number,
    instanceProps: InstanceProps
  ): number => instanceProps.cellMetadataMap[index].size,

  getEstimatedTotalSize,

  getOffsetForIndexAndAlignment: (
    props: Props,
    index: number,
    align: ScrollToAlign,
    scrollOffset: number,
    instanceProps: InstanceProps
  ): number => {
    const { direction, height, width } = props;

    const size = (((direction === 'horizontal' ? width : height): any): number);
    const cellMetadata = getCellMetadata(props, index, instanceProps);

    // Get estimated total size after CellMetadata is computed,
    // To ensure it reflects actual measurements instead of just estimates.
    const estimatedTotalSize = getEstimatedTotalSize(props, instanceProps);

    const maxOffset = Math.min(estimatedTotalSize - size, cellMetadata.offset);
    const minOffset = Math.max(
      0,
      cellMetadata.offset - size + cellMetadata.size
    );

    switch (align) {
      case 'start':
        return maxOffset;
      case 'end':
        return minOffset;
      case 'center':
        return Math.round(minOffset + (maxOffset - minOffset) / 2);
      case 'auto':
      default:
        if (scrollOffset >= minOffset && scrollOffset <= maxOffset) {
          return scrollOffset;
        } else if (scrollOffset - minOffset < maxOffset - scrollOffset) {
          return minOffset;
        } else {
          return maxOffset;
        }
    }
  },

  getStartIndexForOffset: (
    props: Props,
    offset: number,
    instanceProps: InstanceProps
  ): number => findNearestCell(props, instanceProps, offset),

  getStopIndexForStartIndex: (
    props: Props,
    startIndex: number,
    scrollOffset: number,
    instanceProps: InstanceProps
  ): number => {
    const { count, direction, height, width } = props;

    const size = (((direction === 'horizontal' ? width : height): any): number);
    const cellMetadata = getCellMetadata(props, startIndex, instanceProps);
    const maxOffset = scrollOffset + size;

    let offset = cellMetadata.offset + cellMetadata.size;
    let stopIndex = startIndex;

    while (stopIndex < count - 1 && offset < maxOffset) {
      stopIndex++;
      offset += getCellMetadata(props, stopIndex, instanceProps).size;
    }

    return stopIndex;
  },

  initInstanceProps(props: Props, instance: any): InstanceProps {
    const { estimatedItemSize } = ((props: any): DynanmicProps);

    const instanceProps = {
      cellMetadataMap: {},
      estimatedItemSize: estimatedItemSize || DEFAULT_ESTIMATED_ITEM_SIZE,
      lastMeasuredIndex: -1,
    };

    instance.resetAfterIndex = (index: number) => {
      instanceProps.lastMeasuredIndex = index - 1;
    };

    return instanceProps;
  },

  validateProps: ({ itemSize }: Props): void => {
    if (process.env.NODE_ENV !== 'production') {
      if (typeof itemSize !== 'function') {
        throw Error(
          'An invalid "itemSize" prop has been specified. ' +
            'Value should be a function. ' +
            `"${itemSize === null ? 'null' : typeof itemSize}" was specified.`
        );
      }
    }
  },
});

export default VariableSizeList;