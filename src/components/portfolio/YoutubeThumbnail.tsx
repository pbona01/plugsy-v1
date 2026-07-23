import React, { useState } from 'react';

export const YoutubeThumbnail = ({ 
  videoId, 
  style 
}: { 
  videoId: string;
  style?: React.CSSProperties;
}) => {
  const [quality, setQuality] = useState<
    "maxresdefault" | "hqdefault" | "mqdefault" | "default"
  >("maxresdefault");

  const src = "https://img.youtube.com/vi/" + videoId + "/" + quality + ".jpg";

  const handleError = () => {
    if (quality === "maxresdefault") setQuality("hqdefault");
    else if (quality === "hqdefault") setQuality("mqdefault");
    else if (quality === "mqdefault") setQuality("default");
  };

  return (
    <img
      src={src}
      onError={handleError}
      style={{
        width: "100%",
        height: "100%",
        objectFit: "cover",
        display: "block",
        ...style
      }}
      alt=""
    />
  );
};
