// @flow

import createListComponent from './createListComponent';

import type { Props, ScrollToAlign } from './createListComponent';

const DEFAULT_ESTIMATED_ITEM_SIZE = 50;

type DynanmicProps = {|
  estimatedItemSize: number,
  ...Props,
|};

type itemSizeGetter = (index: number) => number;

type ItemMetadata = {|
  offset: number,
  size: number,
|};
type InstanceProps = {|
  itemMetadataMap: { [index: number]: ItemMetadata },
  estimatedItemSize: number,
  lastMeasuredIndex: number,
|};

const getItemMetadata = (
  props: Props,
  index: number,
  instanceProps: InstanceProps
): ItemMetadata => {
  const { itemSize } = ((props: any): DynanmicProps);
  const { itemMetadataMap, lastMeasuredIndex } = instanceProps;

  if (index > lastMeasuredIndex) {
    let offset = 0;
    if (lastMeasuredIndex >= 0) {
      const itemMetadata = itemMetadataMap[lastMeasuredIndex];
      offset = itemMetadata.offset + itemMetadata.size;
    }

    for (let i = lastMeasuredIndex + 1; i <= index; i++) {
      let size = ((itemSize: any): itemSizeGetter)(i);

      itemMetadataMap[i] = {
        offset,
        size,
      };

      offset += size;
    }

    instanceProps.lastMeasuredIndex = index;
  }

  return itemMetadataMap[index];
};

const findNearestItem = (
  props: Props,
  instanceProps: InstanceProps,
  offset: number
) => {
  const { itemMetadataMap, lastMeasuredIndex } = instanceProps;

  const lastMeasuredItemOffset =
    lastMeasuredIndex > 0 ? itemMetadataMap[lastMeasuredIndex].offset : 0;

  if (lastMeasuredItemOffset >= offset) {
    // If we've already measured items within this range just use a binary search as it's faster.
    return findNearestItemBinarySearch(
      props,
      instanceProps,
      lastMeasuredIndex,
      0,
      offset
    );
  } else {
    // If we haven't yet measured this high, fallback to an exponential search with an inner binary search.
    // The exponential search avoids pre-computing sizes for the full set of items as a binary search would.
    // The overall complexity for this approach is O(log n).
    return findNearestItemExponentialSearch(
      props,
      instanceProps,
      lastMeasuredIndex,
      offset
    );
  }
};

const findNearestItemBinarySearch = (
  props: Props,
  instanceProps: InstanceProps,
  high: number,
  low: number,
  offset: number
): number => {
  while (low <= high) {
    const middle = low + Math.floor((high - low) / 2);
    const currentOffset = getItemMetadata(props, middle, instanceProps).offset;

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

const findNearestItemExponentialSearch = (
  props: Props,
  instanceProps: InstanceProps,
  index: number,
  offset: number
): number => {
  const { itemCount } = props;
  let interval = 1;

  while (
    index < itemCount &&
    getItemMetadata(props, index, instanceProps).offset < offset
  ) {
    index += interval;
    interval *= 2;
  }

  return findNearestItemBinarySearch(
    props,
    instanceProps,
    Math.min(index, itemCount - 1),
    Math.floor(index / 2),
    offset
  );
};

const getEstimatedTotalSize = (
  { itemCount }: Props,
  { itemMetadataMap, estimatedItemSize, lastMeasuredIndex }: InstanceProps
) => {
  let totalSizeOfMeasuredItems = 0;

  if (lastMeasuredIndex >= 0) {
    const itemMetadata = itemMetadataMap[lastMeasuredIndex];
    totalSizeOfMeasuredItems = itemMetadata.offset + itemMetadata.size;
  }

  const numUnmeasuredItems = itemCount - lastMeasuredIndex - 1;
  const totalSizeOfUnmeasuredItems = numUnmeasuredItems * estimatedItemSize;

  return totalSizeOfMeasuredItems + totalSizeOfUnmeasuredItems;
};

const VariableSizeList = createListComponent({
  getItemOffset: (
    props: Props,
    index: number,
    instanceProps: InstanceProps
  ): number => getItemMetadata(props, index, instanceProps).offset,

  getItemSize: (
    props: Props,
    index: number,
    instanceProps: InstanceProps
  ): number => instanceProps.itemMetadataMap[index].size,

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
    const itemMetadata = getItemMetadata(props, index, instanceProps);

    // Get estimated total size after ItemMetadata is computed,
    // To ensure it reflects actual measurements instead of just estimates.
    const estimatedTotalSize = getEstimatedTotalSize(props, instanceProps);

    const maxOffset = Math.min(estimatedTotalSize - size, itemMetadata.offset);
    const minOffset = Math.max(
      0,
      itemMetadata.offset - size + itemMetadata.size
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
  ): number => findNearestItem(props, instanceProps, offset),

  getStopIndexForStartIndex: (
    props: Props,
    startIndex: number,
    scrollOffset: number,
    instanceProps: InstanceProps
  ): number => {
    const { direction, height, itemCount, width } = props;

    const size = (((direction === 'horizontal' ? width : height): any): number);
    const itemMetadata = getItemMetadata(props, startIndex, instanceProps);
    const maxOffset = scrollOffset + size;

    let offset = itemMetadata.offset + itemMetadata.size;
    let stopIndex = startIndex;

    while (stopIndex < itemCount - 1 && offset < maxOffset) {
      stopIndex++;
      offset += getItemMetadata(props, stopIndex, instanceProps).size;
    }

    return stopIndex;
  },

  initInstanceProps(props: Props, instance: any): InstanceProps {
    const { estimatedItemSize } = ((props: any): DynanmicProps);

    const instanceProps = {
      itemMetadataMap: {},
      estimatedItemSize: estimatedItemSize || DEFAULT_ESTIMATED_ITEM_SIZE,
      lastMeasuredIndex: -1,
    };

    instance.resetAfterIndex = (index: number) => {
      instanceProps.lastMeasuredIndex = Math.min(
        instanceProps.lastMeasuredIndex,
        index - 1
      );

      // We could potentially optimize further by only evicting styles after this index,
      // But since styles are only cached while scrolling is in progress-
      // It seems an unnecessary optimization.
      // It's unlikely that resetAfterIndex() will be called while a user is scrolling.
      instance._itemStyleCache = {};
      instance.forceUpdate();
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
