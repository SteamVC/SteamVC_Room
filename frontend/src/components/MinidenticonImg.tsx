import { minidenticon } from 'minidenticons';
import { useMemo } from 'react';

interface MinidenticonImgProps {
  username: string;
  saturation?: string;
  lightness?: string;
  width?: number;
  height?: number;
  className?: string;
}

export const MinidenticonImg = ({
  username,
  saturation = '50',
  lightness = '50',
  width = 96,
  height = 96,
  className = '',
  ...props
}: MinidenticonImgProps) => {
  const svgURI = useMemo(
    () =>
      'data:image/svg+xml;utf8,' +
      encodeURIComponent(minidenticon(username, saturation, lightness)),
    [username, saturation, lightness]
  );

  return (
    <img
      src={svgURI}
      alt={username}
      width={width}
      height={height}
      className={className}
      {...props}
    />
  );
};
