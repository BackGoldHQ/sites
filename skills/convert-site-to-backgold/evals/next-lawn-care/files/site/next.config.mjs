export default {
  async redirects() {
    return [{ source: '/quote', destination: '/contact', permanent: true }, { source: '/lawn-mowing', destination: '/services/mowing', permanent: true }]
  },
}
