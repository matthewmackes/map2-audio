/**
 * Branding Panel - Manufacturer Logo, Product Image, and Marketing Information
 */

import { Box, Paper, Grid, Link, Typography } from '@mui/material'
import { ExternalLink } from 'lucide-react'

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
    <Paper
      elevation={3}
      sx={{
        p: 4,
        mb: 3,
        background: `linear-gradient(135deg, ${branding.brand_color}44 0%, ${branding.brand_color}22 50%, rgba(30,30,30,0.95) 100%)`,
        borderLeft: `4px solid ${branding.brand_color}`,
        border: `1px solid ${branding.brand_color}55`,
      }}
    >
      <Grid container spacing={4} alignItems="center">
        {/* Manufacturer Logo */}
        <Grid item xs={12} sm={3} md={2} display="flex" justifyContent="center">
          <Box
            component="img"
            src={branding.logo_url}
            alt={branding.manufacturer}
            onError={(e) => {
              ;(e.target as HTMLImageElement).src = branding.logo_fallback
            }}
            sx={{
              maxHeight: 80,
              maxWidth: 150,
              objectFit: 'contain',
              filter: 'brightness(0) invert(1)',
            }}
          />
        </Grid>

        {/* Product Image */}
        <Grid item xs={12} sm={4} md={3}>
          <Paper
            sx={{
              overflow: 'hidden',
              backgroundColor: 'rgba(255,255,255,0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 150,
              border: '1px solid rgba(255,255,255,0.12)',
            }}
          >
            <Box
              component="img"
              src={branding.product_image_url}
              alt={branding.product_name}
              onError={(e) => {
                ;(e.target as HTMLImageElement).src = '/img/manufacturers/generic-pc.svg'
              }}
              sx={{
                maxHeight: '100%',
                maxWidth: '100%',
                objectFit: 'contain',
                p: 1,
              }}
            />
          </Paper>
        </Grid>

        {/* Product Information */}
        <Grid item xs={12} sm={5} md={7}>
          <Box>
            <Typography
              variant="overline"
              sx={{ color: branding.brand_color, fontWeight: 600, display: 'block', mb: 1, letterSpacing: 2 }}
            >
              {branding.manufacturer.toUpperCase()}
            </Typography>

            <Typography
              variant="h4"
              sx={{
                mt: 1,
                fontWeight: 700,
                color: '#fff',
              }}
            >
              {branding.marketing_name}
            </Typography>

            <Typography
              variant="body2"
              sx={{ mt: 2, color: 'rgba(255,255,255,0.7)' }}
            >
              Model: <strong style={{ color: 'rgba(255,255,255,0.9)' }}>{branding.product_name}</strong>
            </Typography>

            {branding.warranty_status && (
              <Typography
                variant="body2"
                sx={{ mt: 1, color: 'rgba(255,255,255,0.7)' }}
              >
                Warranty: <strong style={{ color: 'rgba(255,255,255,0.9)' }}>{branding.warranty_status}</strong>
              </Typography>
            )}

            {branding.sff_optimized && (
              <Typography
                variant="body2"
                sx={{
                  mt: 1,
                  color: '#34d399',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                }}
              >
                ✓ Small Form Factor Optimized for Audio Production
              </Typography>
            )}

            <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
              {branding.support_url && (
                <Link
                  href={branding.support_url}
                  target="_blank"
                  rel="noopener"
                  sx={{
                    color: branding.brand_color,
                    fontWeight: 600,
                    textDecoration: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    '&:hover': { textDecoration: 'underline', color: '#fff' },
                  }}
                >
                  Official Support <ExternalLink size={14} />
                </Link>
              )}
            </Box>
          </Box>
        </Grid>
      </Grid>
    </Paper>
  )
}
