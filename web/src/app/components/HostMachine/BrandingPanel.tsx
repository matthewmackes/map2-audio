/**
 * Branding Panel - Manufacturer identity, product image, and quick links
 */

import { CheckmarkFilled as SealCheck, Launch as ArrowSquareOut } from '@carbon/icons-react'

interface BrandingPanelProps {
  branding: {
    manufacturer: string
    logo_url: string
    logo_fallback: string
    product_image_url: string
    marketing_name: string
    product_name: string
    support_url: string
    warranty_status?: string
    brand_color: string
    sff_optimized: boolean
  }
}

export default function BrandingPanel({ branding }: BrandingPanelProps) {
  return (
    <div className="hm-branding">
      {/* Manufacturer logo */}
      <div className="hm-branding__logo-wrap">
        <img
          src={branding.logo_url}
          alt={branding.manufacturer}
          className="hm-branding__logo"
          onError={(e) => {
            ;(e.target as HTMLImageElement).src = branding.logo_fallback
          }}
        />
      </div>

      {/* Product image */}
      <div className="hm-branding__image-wrap">
        <img
          src={branding.product_image_url}
          alt={branding.product_name}
          className="hm-branding__image"
          onError={(e) => {
            ;(e.target as HTMLImageElement).src = '/img/manufacturers/generic-pc.svg'
          }}
        />
      </div>

      {/* Product copy */}
      <div className="hm-branding__copy">
        <div className="hm-branding__mfr">
          {branding.manufacturer.toUpperCase()}
        </div>
        <div className="hm-branding__name">{branding.marketing_name}</div>
        <div className="hm-branding__model">
          Model: <strong>{branding.product_name}</strong>
        </div>
        {branding.warranty_status && (
          <div className="hm-branding__warranty">
            Warranty: <strong>{branding.warranty_status}</strong>
          </div>
        )}
        {branding.sff_optimized && (
          <div className="hm-branding__sff">
            <SealCheck size={14} />
            Small Form Factor — Audio Optimized
          </div>
        )}
        {branding.support_url && (
          <a
            href={branding.support_url}
            target="_blank"
            rel="noopener noreferrer"
            className="hm-branding__support-link"
          >
            Official Support <ArrowSquareOut size={13} />
          </a>
        )}
      </div>
    </div>
  )
}
