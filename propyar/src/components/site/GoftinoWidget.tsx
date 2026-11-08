import Script from 'next/script';

/**
 * Goftino live-chat widget. Renders nothing until NEXT_PUBLIC_GOFTINO_ID is
 * set, so the site works unchanged before the plan is bought. Operator hours
 * (when the chat shows as online) are configured in the Goftino panel itself.
 */
export function GoftinoWidget() {
  const id = process.env.NEXT_PUBLIC_GOFTINO_ID;
  if (!id || !/^[A-Za-z0-9]+$/.test(id)) return null;
  const src = `https://www.goftino.com/widget/${id}`;
  return (
    <Script id="goftino-widget" strategy="lazyOnload">
      {`!function(){var i=${JSON.stringify(id)},s=${JSON.stringify(src)},d=document,l=null;try{l=localStorage.getItem("goftino_"+i)}catch(e){}var g=d.createElement("script");g.async=!0;g.src=l?s+"?o="+l:s;d.getElementsByTagName("head")[0].appendChild(g)}();`}
    </Script>
  );
}
